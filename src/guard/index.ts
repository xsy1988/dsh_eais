import { fileURLToPath } from 'node:url'
import { readManifest, resolvePackageRoot, type PackageManifest } from './manifest.js'
import { ToolPolicyController } from './tools.js'
import { ForgeSessionController } from './forge-session.js'
import { InstallPolicy } from './install-policy.js'
import type { EaisRuntimeSession } from '../adapter/index.js'

const TOKEN_REF = 'EAIS_TOKEN'
const SETTINGS_NAMESPACE = 'eais'
const DEFAULT_SERVER = 'http://127.0.0.1:18080'
const SELF_PACKAGE = '@corp/dsh-eais'
const MIN_INTERVAL_MS = 60_000
const MAX_INTERVAL_MS = 6 * 60 * 60_000
const RETRY_BASE_MS = 30_000
const RETRY_MAX_MS = 10 * 60_000

export interface GuardOptions {
  serverUrl?: string
  installationId?: string
  deviceName?: string
  packages?: string[]
  include?: string[]
  /** Optional package-name-to-directory overrides when the host layout hides node_modules. */
  packagePaths?: Record<string, string>
  packageRoot?: string
  fetchImpl?: typeof fetch
  pluginForge?: boolean
  readSession?: () => EaisRuntimeSession | undefined
  onPluginRemoved?: (packageName: string) => void
}

interface EaisSettings {
  serverUrl?: string
  installationId?: string
  deviceName?: string
  guardState?: GuardState
  pluginSources?: Record<string, string>
}

interface Credential {
  value?: string
}

interface SettingsController {
  get?<T = unknown>(namespace: string): T | undefined | Promise<T | undefined>
  update(namespace: string, value: unknown, expectedRevision: number | undefined): unknown | Promise<unknown>
}

export interface GuardContext {
  credentials: {
    resolve(ref: string): Credential | string | undefined | Promise<Credential | string | undefined>
  }
  settingsController?: SettingsController
  commands?: { register(definition: unknown): unknown }
  pluginManager?: { removeBundle(name: string): Promise<{ application?: string }> }
  get?<T = unknown>(name: string): T | undefined
  on?(event: string, listener: (...args: any[]) => unknown): unknown
}

interface ReportItem {
  package_name: string
  version: string
  content_hash: string
  dependency_tree_digest: string
}

interface ReportResult {
  lease_until?: string
  report_interval_seconds?: number
  mandatory_missing?: string[]
  recalls?: Array<{ recall_id?: string; plugin_no?: string; package_name?: string; reason?: string; action?: string }>
  findings?: string[]
}

export interface GuardState {
  phase: 'starting' | 'ready' | 'retrying' | 'disabled' | 'stopped'
  deviceId: string
  lastReportAt?: string
  leaseUntil?: string
  intervalSeconds?: number
  findings?: string[]
  recalls?: Array<{ packageName: string; reason: string; action: string }>
  reason?: string
}

class Guard {
  private timer?: ReturnType<typeof setTimeout>
  private stopped = false
  private attempts = 0
  private state: GuardState
  private leaseUntil?: Date
  private disabled = new Set<string>()
  private persistEnabled = true
  private readonly toolPolicy: ToolPolicyController
  private readonly fetchImpl: typeof fetch
  private readonly forge?: ForgeSessionController
  private readonly installPolicy?: InstallPolicy
  private stopForge?: () => void
  private stopInstall?: () => void

  constructor(
    private readonly ctx: GuardContext,
    private readonly config: GuardOptions,
  ) {
    this.state = { phase: 'starting', deviceId: config.deviceName ?? '' }
    this.toolPolicy = new ToolPolicyController(ctx, config, { fetchImpl: config.fetchImpl })
    this.fetchImpl = config.fetchImpl ?? fetch
    if (config.pluginForge === true && config.readSession) {
      this.forge = new ForgeSessionController(ctx, {
        serverUrl: config.serverUrl, fetchImpl: config.fetchImpl, readSession: config.readSession,
      })
      this.installPolicy = new InstallPolicy(ctx, this.forge)
      this.toolPolicy.setForgeController(this.forge)
    }
  }

  async start(): Promise<void> {
    this.stopForge = this.forge?.start()
    this.stopInstall = this.installPolicy?.start()
    const policy = this.toolPolicy.start()
    await this.restore()
    await policy
    await this.report()
  }

  forgeStatus(sessionID: string): { active: boolean, expiresAt?: string, notice?: string } {
    return this.forge?.status(sessionID) ?? { active: false }
  }

  async forgeControl(sessionID: string, action: 'extend' | 'end' | 'prompt', text = ''): Promise<void> {
    if (!this.forge) throw new Error('插件创作尚未开放')
    await this.forge.control(sessionID, action, text)
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.stopInstall?.()
    this.stopForge?.()
    this.toolPolicy.stop()
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.state = { ...this.state, phase: 'stopped' }
  }

  private async report(): Promise<void> {
    if (this.stopped) return
    try {
      const settings = await this.readSettings()
      const serverUrl = normalizeUrl(this.config.serverUrl || settings.serverUrl || DEFAULT_SERVER)
      const token = await this.readToken()
      if (!token) {
        this.log('EAIS token unavailable; waiting for login')
        this.schedule(RETRY_BASE_MS)
        return
      }
      const deviceId = this.config.installationId ?? settings.installationId ?? this.config.deviceName ?? settings.deviceName ?? 'dsh'
      const installationId = deviceId
      const packages = this.config.packages ?? [SELF_PACKAGE]
      if (this.leaseExpired()) {
        for (const packageName of packages) this.disabled.add(packageName)
      }
      const disabledItems = [...this.disabled].map((packageName) => ({
        package_name: packageName,
        reason: '租约到期未续，企业能力已自我停用',
      }))
      const items = this.manifest().map((manifest) => ({
        package_name: manifest.packageName,
        version: manifest.version,
        content_hash: manifest.contentHash,
        dependency_tree_digest: manifest.dependencyTreeDigest,
      }))
      const response = await this.fetchImpl(`${serverUrl}/software/report`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ device_id: deviceId, installation_id: installationId, items, disabled_items: disabledItems }),
      })
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300)
        throw new Error(`software report returned ${response.status}: ${detail}`)
      }
      const result = (await response.json()) as ReportResult
      const intervalSeconds = clampInterval(result.report_interval_seconds ?? 21_600)
      this.attempts = 0
      this.leaseUntil = result.lease_until ? new Date(result.lease_until) : undefined
      this.disabled.clear()
      this.state = {
        phase: result.recalls?.some((recall) => recall.action === 'disable') ? 'disabled' : 'ready',
        deviceId,
        lastReportAt: new Date().toISOString(),
        leaseUntil: result.lease_until,
        intervalSeconds,
        findings: result.findings ?? [],
        recalls: (result.recalls ?? []).map((recall) => ({
          packageName: recall.package_name ?? '',
          reason: recall.reason ?? '',
          action: recall.action ?? 'uninstall',
        })),
      }
      if (this.state.phase === 'disabled') {
        this.log('guard disabled by recall', this.state.recalls)
      }
      if (result.mandatory_missing?.length) {
        this.log('mandatory packages missing', result.mandatory_missing)
      }
      await this.persist()
      await this.cleanupRecalls(result.recalls ?? [])
      this.schedule(intervalSeconds * 1000)
    } catch (error) {
      this.attempts++
      this.state = {
        ...this.state,
        phase: 'retrying',
        reason: error instanceof Error ? error.message : String(error),
      }
      this.log('software report failed', this.state.reason)
      this.schedule(Math.min(RETRY_BASE_MS * 2 ** Math.min(this.attempts - 1, 5), RETRY_MAX_MS))
    }
  }

  private async cleanupRecalls(recalls: NonNullable<ReportResult['recalls']>): Promise<void> {
    for (const recall of recalls) {
      const packageName = recall.package_name ?? ''
      if (!packageName || packageName === SELF_PACKAGE || recall.action !== 'uninstall') continue
      try {
        const result = await this.ctx.pluginManager?.removeBundle(packageName)
        if (result?.application === 'failed') throw new Error('插件删除失败')
        this.config.onPluginRemoved?.(packageName)
        if (recall.plugin_no) await this.forgetSource(recall.plugin_no)
      } catch (error) {
        this.log('plugin recall cleanup failed', error instanceof Error ? error.message : String(error))
      }
    }
  }

  private async forgetSource(pluginNo: string): Promise<void> {
    const controller = this.settingsController()
    if (!controller?.get) return
    const settings = await this.readSettings()
    if (!settings.pluginSources?.[pluginNo]) return
    const sources = { ...settings.pluginSources }
    delete sources[pluginNo]
    const current = await controller.get<Record<string, unknown>>(SETTINGS_NAMESPACE)
    await controller.update(SETTINGS_NAMESPACE, { ...(current ?? {}), pluginSources: sources }, undefined)
  }

  private manifest(): PackageManifest[] {
    const packages = this.config.packages ?? [SELF_PACKAGE]
    return packages.map((packageName) => {
      const override = this.config.packagePaths?.[packageName]
      return readManifest(this.packageRoot(packageName, override), packageName, this.config.include ?? ['lib'])
    })
  }

  private packageRoot(packageName: string, override?: string): string {
    if (this.config.packageRoot) return this.config.packageRoot
    if (override) return resolvePackageRoot(packageName, [override])
    try {
      return resolvePackageRoot(packageName)
    } catch (error) {
      const root = selfRoot()
      if (root) return root
      throw error
    }
  }

  private async readToken(): Promise<string | undefined> {
    const resolved = await this.ctx.credentials.resolve(TOKEN_REF)
    if (typeof resolved === 'string') return resolved || undefined
    return typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined
  }

  private async readSettings(): Promise<EaisSettings> {
    const controller = this.settingsController()
    if (!controller?.get) return {}
    const value = await controller.get<EaisSettings>(SETTINGS_NAMESPACE)
    return value && typeof value === 'object' ? value : {}
  }

  private settingsController(): SettingsController | undefined {
    return this.ctx.settingsController ?? this.ctx.get?.<SettingsController>('settingsController')
  }

  private leaseExpired(): boolean {
    return this.leaseUntil !== undefined && Date.now() > this.leaseUntil.getTime()
  }

  private async restore(): Promise<void> {
    let saved: GuardState | undefined
    try {
      saved = (await this.readSettings()).guardState
    } catch {
      return
    }
    if (!saved || typeof saved !== 'object') return
    if (saved.leaseUntil) {
      const parsed = new Date(saved.leaseUntil)
      if (!Number.isNaN(parsed.getTime())) this.leaseUntil = parsed
    }
    for (const recall of saved.recalls ?? []) {
      if (recall.action === 'disable' && recall.packageName) this.disabled.add(recall.packageName)
    }
  }

  private async persist(): Promise<void> {
    if (!this.persistEnabled) return
    const controller = this.settingsController()
    if (!controller?.get || !controller.update) return
    try {
      const current = await controller.get<EaisSettings>(SETTINGS_NAMESPACE) ?? {}
      await controller.update(SETTINGS_NAMESPACE, {
        ...current,
        guardState: {
          ...this.state,
          leaseUntil: this.leaseUntil?.toISOString() ?? this.state.leaseUntil,
          disabledPackages: [...this.disabled],
          updatedAt: new Date().toISOString(),
        },
      }, undefined)
    } catch (error) {
      // Reporting must not fail just because local state cannot be persisted.
      this.persistEnabled = false
      this.log('guard state not persisted', error instanceof Error ? error.message : String(error))
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.report()
    }, delayMs)
  }

  private log(message: string, detail?: unknown): void {
    console.warn(`[eais] guard: ${message}`, detail ?? '')
  }
}

export interface GuardHandle {
  ready: Promise<void>
  forgeStatus(sessionID: string): { active: boolean, expiresAt?: string, notice?: string }
  forgeControl(sessionID: string, action: 'extend' | 'end' | 'prompt', text?: string): Promise<void>
  stop(): Promise<void>
}

export function startGuard(ctx: GuardContext, config: GuardOptions = {}): GuardHandle {
  console.info('[eais] guard starting', { packages: config.packages ?? [SELF_PACKAGE] })
  const guard = new Guard(ctx, config)
  const ready = guard.start().catch((error) => {
    console.warn('[eais] guard failed to start', error instanceof Error ? error.message : String(error))
    guard.stop()
  })
  return {
    ready,
    forgeStatus: sessionID => guard.forgeStatus(sessionID),
    forgeControl: (sessionID, action, text) => guard.forgeControl(sessionID, action, text),
    stop: async () => guard.stop(),
  }
}

function selfRoot(): string | undefined {
  try {
    return fileURLToPath(new URL('../..', import.meta.url))
  } catch {
    return undefined
  }
}

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function clampInterval(seconds: number): number {
  const milliseconds = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, seconds * 1000))
  return Math.round(milliseconds / 1000)
}

export { readManifest, resolvePackageRoot } from './manifest.js'
export type { PackageManifest } from './manifest.js'
