import z from '@deepseek-ai/schemastery'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import { EaisAdapter, type EaisRuntimeSession } from './adapter/index.js'
import { fetchMe, normalizeServerUrl, type FetchLike } from './api.js'
import {
  EAIS_PROVIDER,
  EAIS_TOKEN_REF,
  EaisError,
  failure,
  initialPublicState,
  type EaisConfig,
  type EaisFailure,
  type EaisMe,
  type EaisPublicState,
  type EaisStatus,
} from './contracts.js'
import { startGuard } from './guard/index.js'
import { DEFAULT_ENTERPRISE_PRESETS, DEFAULT_ENTERPRISE_PROVIDERS, installModelGate } from './modelGate.js'
import { disposeAll, SerialMountQueue } from './mount.js'
import {
  isDisposable,
  readSettings,
  registerAdapter,
  resolveVolatile,
  settingsControllerOf,
  writeSettings,
  type AdapterRegistration,
  type Disposable,
  type HostContext,
} from './port.js'
import { credentialValue, logoutSession } from './session.js'

export interface EaisHostOptions extends EaisConfig {
  installationId?: string
  deviceName?: string
  softwareGuard?: boolean
  fetchImpl?: FetchLike
  deferStart?: boolean
}

export const name = 'eais'
export const inject = ['llm', 'credentials', 'settingsController', 'agentDefaultModel']
export const Config = z.object({
  serverUrl: z.string().default('http://127.0.0.1:18080').volatile(),
  serverUrlReadOnly: z.boolean().default(true).volatile(),
  installationId: z.string().volatile(),
  deviceName: z.string().volatile(),
  softwareGuard: z.boolean().default(true),
  state: z.any().volatile(),
  logoutRequestedAt: z.string().volatile(),
  mcpReconnectRequestedAt: z.string().volatile(),
  guardState: z.any().volatile(),
  guardToolPolicy: z.any().volatile(),
  enforceModelMode: z.boolean().default(true),
  enterprisePresets: z.array(z.string()).default(['eais-chat']),
  enterpriseProviders: z.array(z.string()).default(['eais']),
  defaultPreset: z.string().default('eais-chat'),
})

interface Mounted {
  serverUrl: string
  session: EaisRuntimeSession
  adapter: AdapterRegistration
}

interface McpMount {
  url: string
  token: string
  revision?: string
  disposable: Disposable
}

export interface EaisHostHandle extends Disposable {
  synchronize(): Promise<void>
  logout(): Promise<void>
}

class EaisHost {
  private readonly queue = new SerialMountQueue()
  private current?: Mounted
  private mcpMount?: McpMount
  private mcpState: EaisPublicState['mcp'] = { phase: 'disabled' }
  private closed = false
  private loggingOut = false
  private lastLogoutRequest?: string
  private logoutRequested = false
  private lastReconnectRequest?: string
  private reconnectRequested = false
  private reconnecting = false
  private logoutWatch?: ReturnType<typeof setInterval>
  private previousSelection?: { provider: string; model: string }

  constructor(
    private readonly ctx: HostContext,
    private readonly options: EaisHostOptions,
  ) {}

  async initialize(): Promise<void> {
    const settings = await readSettings(settingsControllerOf(this.ctx))
    this.lastLogoutRequest = settings.logoutRequestedAt
    this.lastReconnectRequest = settings.mcpReconnectRequestedAt
  }

  handleCredentialUpdate(ref: unknown): void {
    if (ref !== EAIS_TOKEN_REF || this.loggingOut) return
    void this.synchronize().catch(() => undefined)
  }

  handleSettingsUpdate(): void {
    this.logoutRequested = true
    this.reconnectRequested = true
  }

  startLogoutWatch(): () => void {
    if (this.logoutWatch !== undefined) return () => undefined
    this.logoutWatch = setInterval(() => {
      if (this.logoutRequested && !this.loggingOut) {
        this.logoutRequested = false
        void this.checkLogoutRequest().catch((error) => {
          console.error('[eais] settings logout request failed', error)
        })
      }
      if (this.reconnectRequested && !this.loggingOut) {
        this.reconnectRequested = false
        void this.checkReconnectRequest().catch((error) => {
          console.error('[eais] settings MCP reconnect request failed', error)
        })
      }
    }, 500)
    return () => {
      if (this.logoutWatch !== undefined) clearInterval(this.logoutWatch)
      this.logoutWatch = undefined
    }
  }

  private async checkLogoutRequest(): Promise<void> {
    const settings = await readSettings(settingsControllerOf(this.ctx))
    const request = settings.logoutRequestedAt
    if (!request || request === this.lastLogoutRequest) return
    this.lastLogoutRequest = request
    await this.logout()
  }

  private async checkReconnectRequest(): Promise<void> {
    const settings = await readSettings(settingsControllerOf(this.ctx))
    const request = settings.mcpReconnectRequestedAt
    if (!request || request === this.lastReconnectRequest) return
    this.lastReconnectRequest = request
    await this.reconnectMcp()
  }

  async reconnectMcp(): Promise<void> {
    await this.queue.run(async () => {
      this.reconnecting = true
      try {
        await this.disposeMcp().catch(() => undefined)
        this.mcpState = { phase: 'mounting' }
        await this.synchronizeNow()
      } finally {
        this.reconnecting = false
      }
    })
  }

  async synchronize(): Promise<void> {
    try {
      await this.queue.run(() => this.synchronizeNow())
    } catch (error) {
      await this.publishFailure(failure(error)).catch(() => undefined)
    }
  }

  async logout(): Promise<void> {
    await this.queue.run(() => this.logoutNow())
  }

  private async logoutNow(): Promise<void> {
    const settings = await readSettings(settingsControllerOf(this.ctx))
    const configuredUrl = settings.serverUrl ?? this.options.serverUrl
    if (!configuredUrl) {
      await this.clearCurrent()
      await this.publish(initialPublicState('unconfigured'))
      return
    }
    const serverUrl = normalizeServerUrl(configuredUrl)
    const token = credentialValue(await this.ctx.credentials.resolve(EAIS_TOKEN_REF))
    if (!token) {
      await this.clearCurrent()
      await this.publish(initialPublicState('logged-out'), serverUrl)
      return
    }

    this.loggingOut = true
    try {
      await logoutSession({
        credentials: this.ctx.credentials,
        fetchImpl: this.options.fetchImpl ?? fetch,
        serverUrl,
      })
    } catch (error) {
      const reason = failure(error, 'E_REVOKE_UNCONFIRMED')
      if (this.current) {
        await this.publish(this.stateFromMe('degraded', this.current.session.me, reason), serverUrl)
      } else {
        await this.publish({ ...initialPublicState('degraded'), reason }, serverUrl)
      }
      throw error
    } finally {
      this.loggingOut = false
    }

    await this.clearCurrent()
    await this.publish(initialPublicState('logged-out'), serverUrl, true)
  }

  async close(): Promise<void> {
    this.closed = true
    await this.queue.close()
    await this.clearCurrent()
  }

  private async synchronizeNow(): Promise<void> {
    const settings = await readSettings(settingsControllerOf(this.ctx))
    const token = credentialValue(await this.ctx.credentials.resolve(EAIS_TOKEN_REF))
    const configuredUrl = settings.serverUrl ?? this.options.serverUrl
    if (!configuredUrl || !token) {
      await this.clearCurrent()
      await this.publish(
        initialPublicState(configuredUrl ? 'logged-out' : 'unconfigured'),
        configuredUrl ? normalizeServerUrl(configuredUrl) : undefined,
      )
      return
    }

    const serverUrl = normalizeServerUrl(configuredUrl)
    if (this.current && this.current.serverUrl !== serverUrl) {
      await this.clearCurrent()
    }

    if (!this.current) {
      await this.publish(initialPublicState('connecting'), serverUrl)
    }

    try {
      const me = await fetchMe(
        this.options.fetchImpl ?? fetch,
        serverUrl,
        token,
        undefined,
        this.options.allowedOrigins,
      )
      await this.applyMe(serverUrl, token, me)
    } catch (error) {
      const reason = failure(error)
      const expired = error instanceof EaisError && error.status === 401
      if (this.current) {
        this.current.session = { me: this.current.session.me, token }
        if (this.mcpMount && this.mcpMount.token !== token) {
          await this.disposeMcp().catch(() => undefined)
          this.mcpState = {
            phase: 'failed',
            reason: { code: 'E_MCP_STALE', message: '员工卡已更新，MCP 未能在新凭据下重新挂载' },
          }
        }
        await this.publish(
          { ...this.stateFromMe(expired ? 'expired' : 'degraded', this.current.session.me, reason), llm: { phase: 'failed', reason } },
          serverUrl,
        )
      } else {
        await this.publish({
          ...initialPublicState(expired ? 'expired' : 'failed'),
          reason,
          llm: { phase: 'failed', reason },
        }, serverUrl)
      }
    }
  }

  private async applyMe(serverUrl: string, token: string, me: EaisMe): Promise<void> {
    const session = { me, token }
    if (this.current) {
      this.current.session = session
    } else {
      const adapter = await registerAdapter(this.ctx, new EaisAdapter({
        me,
        token,
        readSession: () => this.current?.session,
        fetchImpl: this.options.fetchImpl,
      }))
      this.current = { serverUrl, session, adapter }
    }
    await this.synchronizeMcp(me, token)
    await this.publish(this.stateFromMe('ready', me), serverUrl)
    await this.selectDefaultModel(me)
  }

  private async synchronizeMcp(me: EaisMe, token: string): Promise<void> {
    const declaration = me.mcp
    if (!declaration) {
      await this.disposeMcp().catch(() => undefined)
      this.mcpState = { phase: 'disabled' }
      return
    }
    if (this.mcpMount && this.mcpMount.url === declaration.url && this.mcpMount.token === token && this.mcpMount.revision === declaration.revision) {
      this.mcpState = { phase: 'ready' }
      return
    }

    await this.disposeMcp().catch(() => undefined)
    this.mcpState = { phase: 'mounting' }
    try {
      const config: McpClientConfig = {
        transport: 'streamable-http',
        serverName: declaration.serverName,
        url: declaration.url,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EAIS-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        toolCallTimeoutMs: 60_000,
        failOnStartupError: false,
      }
      const mounted = await this.ctx.plugin(mcpClient, config)
      this.mcpMount = {
        url: declaration.url,
        token,
        revision: declaration.revision,
        disposable: disposableOf(mounted),
      }
      this.mcpState = { phase: 'ready' }
    } catch (error) {
      this.mcpMount = undefined
      this.mcpState = { phase: 'failed', reason: failure(error, 'E_MCP_MOUNT_FAILED') }
    }
  }

  private async disposeMcp(): Promise<void> {
    const mount = this.mcpMount
    this.mcpMount = undefined
    if (mount) await mount.disposable.dispose()
  }

  private async clearCurrent(): Promise<void> {
    const current = this.current
    this.current = undefined
    const errors: unknown[] = []
    try {
      await this.disposeMcp()
    } catch (error) {
      errors.push(error)
    }
    this.mcpState = { phase: 'disabled' }
    if (current) {
      try {
        await disposeAll(current.adapter)
      } catch (error) {
        errors.push(error)
      } finally {
        await this.restoreSelection().catch(() => undefined)
      }
    }
    if (errors.length) throw errors[0]
  }

  private async publish(state: EaisPublicState, serverUrl?: string, clearLogoutRequest = false): Promise<void> {
    if (this.reconnecting || !this.ctx.settingsController) return
    for (let attempt = 0; ; attempt++) {
      try {
        await writeSettings(settingsControllerOf(this.ctx), {
          ...(serverUrl ? { serverUrl } : {}),
          state,
          ...(clearLogoutRequest ? { logoutRequestedAt: '' } : {}),
        })
        return
      } catch (error) {
        const nested = error instanceof Error && error.message.includes('HMR transactions cannot be nested')
        if (!nested || attempt >= 4) throw error
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
      }
    }
  }

  private async publishFailure(reason: EaisFailure): Promise<void> {
    if (this.current) {
      await this.publish({
        ...this.stateFromMe('failed', this.current.session.me, reason),
        llm: { phase: 'failed', reason },
      }, this.current.serverUrl)
      return
    }
    await this.publish({
      ...initialPublicState('failed'),
      reason,
      llm: { phase: 'failed', reason },
    })
  }

  private stateFromMe(status: EaisStatus, me: EaisMe, reason?: EaisFailure): EaisPublicState {
    return {
      ...initialPublicState(status),
      staff: me.staff,
      models: me.llm.models,
      expiresAt: me.card.expiresAt,
      ...(me.ui?.panelBase ? { panelBase: me.ui.panelBase } : {}),
      ...(reason ? { reason } : {}),
      mcp: { ...this.mcpState },
      llm: { phase: 'ready', reason: null },
    }
  }

  private async selectDefaultModel(me: EaisMe): Promise<void> {
    const model = me.llm.models[0]?.id
    const defaults = this.ctx.agentDefaultModel
    if (!model || !defaults?.saveSelection || (!defaults.currentSelection && !defaults.getSelection)) return
    const selection = defaults.currentSelection ? defaults.currentSelection() : await defaults.getSelection?.()
    if (selection?.provider !== EAIS_PROVIDER) {
      if (selection?.provider && selection.model) {
        this.previousSelection ??= { provider: selection.provider, model: selection.model }
      }
      await defaults.saveSelection({ provider: EAIS_PROVIDER, model })
      return
    }
    if (!me.llm.models.some((candidate) => candidate.id === selection.model)) {
      await defaults.saveSelection({ provider: EAIS_PROVIDER, model })
    }
  }

  private async restoreSelection(): Promise<void> {
    const previous = this.previousSelection
    this.previousSelection = undefined
    const defaults = this.ctx.agentDefaultModel
    if (!previous || !defaults?.saveSelection || (!defaults.currentSelection && !defaults.getSelection)) return
    const selection = defaults.currentSelection ? defaults.currentSelection() : await defaults.getSelection?.()
    if (selection?.provider === EAIS_PROVIDER) {
      await defaults.saveSelection(previous)
    }
  }
}

function disposableOf(value: unknown): Disposable {
  if (isDisposable(value)) return value
  if (typeof value === 'function') return { dispose: () => { void (value as () => unknown)() } }
  return { dispose: () => undefined }
}

export async function createEaisHost(ctx: HostContext, config: EaisHostOptions = {}): Promise<EaisHostHandle> {
  const host = new EaisHost(ctx, {
    ...config,
    serverUrl: resolveVolatile(config.serverUrl),
    serverUrlReadOnly: resolveVolatile(config.serverUrlReadOnly),
  })
  await host.initialize().catch(() => undefined)
  const stopLogoutWatch = host.startLogoutWatch()
  const subscriptions = [
    ctx.on('credentials/reference-updated', (ref: unknown) => {
      host.handleCredentialUpdate(ref)
    }),
    ctx.on('settings/document-updated', () => {
      host.handleSettingsUpdate()
    }),
  ]
  if (config.deferStart) void host.synchronize()
  else await host.synchronize()
  return {
    synchronize: () => host.synchronize(),
    logout: () => host.logout(),
    dispose: async () => {
      stopLogoutWatch()
      for (const subscription of subscriptions) {
        if (isDisposable(subscription)) await subscription.dispose()
        else if (typeof subscription === 'function') await subscription()
      }
      await host.close()
    },
  }
}

export async function apply(ctx: HostContext, config: EaisHostOptions = {}): Promise<() => Promise<void>> {
  const handle = await createEaisHost(ctx, { ...config, deferStart: true })
  const releaseGate = config.enforceModelMode === false ? () => undefined : installModelGate(ctx, {
    enterprisePresets: config.enterprisePresets ?? DEFAULT_ENTERPRISE_PRESETS,
    enterpriseProviders: config.enterpriseProviders ?? DEFAULT_ENTERPRISE_PROVIDERS,
    defaultPreset: config.defaultPreset,
  })
  let guard: ReturnType<typeof startGuard> | undefined
  if (config.softwareGuard !== false) {
    try {
      guard = startGuard(ctx, {
        serverUrl: resolveVolatile(config.serverUrl),
        installationId: resolveVolatile(config.installationId),
        deviceName: resolveVolatile(config.deviceName),
        fetchImpl: config.fetchImpl,
      })
    } catch (error) {
      console.warn('[eais] guard failed to start', error instanceof Error ? error.message : String(error))
    }
  }
  return async () => {
    await guard?.stop()
    releaseGate()
    await handle.dispose()
  }
}

export { EaisAdapter } from './adapter/index.js'
export { extractViewIds } from './client/Card.js'
export { credentialValue, expiryState, loginSession, logoutSession } from './session.js'
export type { HostContext } from './port.js'
