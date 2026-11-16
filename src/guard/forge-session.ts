import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { EaisRuntimeSession } from '../adapter/index.js'

interface ForgeHostContext {
  commands?: { register(definition: unknown): unknown }
  on?(event: string, listener: (...args: any[]) => unknown): unknown
}

interface ForgeAgent {
  session: { id: unknown }
  ctx: {
    plugin(plugin: unknown, config: unknown): unknown
    tools?: {
      schemas(): Array<{ name: string }>
      restrict(filter: { allow: string[] }): () => void
    }
  }
  followup?(message: unknown): void
}

interface ForgeCommandInvocation {
  agent: ForgeAgent
  rawInput?: string
}

interface ForgeEntry {
  agent: ForgeAgent
  liftTools?: () => void
  disposable?: { dispose(): unknown }
  timer: ReturnType<typeof setTimeout>
  warningTimer?: ReturnType<typeof setTimeout>
  expiresAt: string
}

export type ForgeEndReason = 'manual' | 'expired' | 'installed' | 'disposed'

const sharedForge = globalThis as { __eaisPluginForgeSessions?: Map<string, ForgeEntry> }
const FORGE_TTL_MS = 2 * 60 * 60 * 1000
const FORGE_WARNING_MS = 5 * 60 * 1000
export const FORGE_GLOBAL_TOOLS = [
  'read', 'write', 'edit', 'glob', 'grep', 'bash', 'pwsh', 'skill', 'ask_user_question',
  'todo_write', 'present', 'cordis_inspect_list', 'cordis_inspect_query',
] as const

export function isForgeSession(sessionID: string): boolean {
  const entry = sharedForge.__eaisPluginForgeSessions?.get(sessionID)
  return entry !== undefined && Date.parse(entry.expiresAt) > Date.now()
}

export interface ForgeSessionOptions {
  serverUrl?: string
  fetchImpl?: typeof fetch
  readSession: () => EaisRuntimeSession | undefined
}

export class ForgeSessionController {
  private readonly sessions = sharedForge.__eaisPluginForgeSessions ?? new Map<string, ForgeEntry>()
  private readonly serverUrl: string
  private readonly fetchImpl: typeof fetch
  private stopped = false
  private commandName = 'plugin-forge'
  private changeListener?: () => void
  private instructions?: Promise<string>
  private readonly notices = new Map<string, string>()

  constructor(private readonly ctx: ForgeHostContext, private readonly options: ForgeSessionOptions) {
    sharedForge.__eaisPluginForgeSessions = this.sessions
    this.serverUrl = (options.serverUrl ?? 'http://127.0.0.1:18080').replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  start(): () => void {
    const disposers: Array<() => unknown> = []
    // 中文名只在支持 Unicode 命令的构建上注册成功；安装版 rc.3 的解析与注册
    // 都用 ^[a-z][a-z0-9_-]*$，中文在解析层就匹配不上，退回英文名。
    for (const name of ['插件创作', 'plugin-forge', 'forge']) {
      try {
        const registration = this.ctx.commands?.register({
          name,
          description: '开启或结束当前会话的插件创作',
          input: { hint: '[要做的插件或修改要求]' },
          handler: (invocation: ForgeCommandInvocation) => this.toggle(invocation),
        })
        if (typeof registration === 'function') disposers.push(() => registration())
        if (name !== 'plugin-forge' && registration !== undefined) this.commandName = name
      } catch (error) {
        if (name === '插件创作') {
          console.warn('[eais] 当前 DSH 构建只接受英文命令名，已改用 /plugin-forge 与 /forge')
        } else {
          console.warn(`[eais] 命令 /${name} 注册失败`, error instanceof Error ? error.message : String(error))
        }
      }
    }
    const listener = this.ctx.on?.('agent/disposed', (payload: unknown) => {
      const agent = (payload as { agent?: ForgeAgent }).agent
      if (agent) void this.exit(String(agent.session.id), false, 'disposed')
    })
    if (typeof listener === 'function') disposers.push(() => listener())
    for (const [sessionID, entry] of this.sessions) this.schedule(sessionID, entry)
    this.notifyChange()
    return () => {
      this.stopped = true
      for (const dispose of disposers) void dispose()
      for (const entry of this.sessions.values()) {
        clearTimeout(entry.timer)
        if (entry.warningTimer) clearTimeout(entry.warningTimer)
      }
    }
  }

  onChange(listener: () => void): void {
    this.changeListener = listener
  }

  status(sessionID: string): { active: boolean, expiresAt?: string, notice?: string } {
    const entry = this.sessions.get(sessionID)
    return { active: this.isForge(sessionID), ...(entry ? { expiresAt: entry.expiresAt } : {}), ...(this.notices.has(sessionID) ? { notice: this.notices.get(sessionID) } : {}) }
  }

  async control(sessionID: string, action: 'extend' | 'end' | 'prompt', text = ''): Promise<void> {
    if (action === 'extend') return this.extend(sessionID)
    if (action === 'end') return this.exit(sessionID, true, 'manual')
    const entry = this.sessions.get(sessionID)
    if (entry && text.trim()) await this.followup(entry.agent, text.trim())
  }

  isForge(sessionID: string): boolean {
    const entry = this.sessions.get(sessionID)
    return entry !== undefined && Date.parse(entry.expiresAt) > Date.now()
  }

  session(): EaisRuntimeSession | undefined {
    return this.options.readSession()
  }

  request(path: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(this.serverUrl + path, init)
  }

  async toggle(invocation: ForgeCommandInvocation): Promise<{ kind: 'success' | 'error', text?: string }> {
    const sessionID = String(invocation.agent.session.id)
    const requirement = invocation.rawInput?.trim() ?? ''
    if (this.isForge(sessionID)) {
      if (!requirement) {
        await this.exit(sessionID, true, 'manual')
        return { kind: 'success', text: '已结束插件创作，执行工具已收回。' }
      }
      await this.followup(invocation.agent, requirement)
      return { kind: 'success', text: '已把修改要求带回当前插件创作会话。' }
    }
    try {
      const session = this.options.readSession()
      if (!session?.me.mcp || !session.token) return { kind: 'error', text: '请先登录 EAIS，再开始插件创作。' }
      const expiresAt = await this.setMode(sessionID, true, session.token)
      const mounted = await invocation.agent.ctx.plugin(mcpClient, {
        transport: 'streamable-http',
        serverName: session.me.mcp.serverName,
        url: session.me.mcp.url,
        headers: {
          Authorization: `Bearer ${session.token}`,
          'X-EAIS-Session-ID': sessionID,
          'X-EAIS-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        toolCallTimeoutMs: 60_000,
        failOnStartupError: true,
      })
      const disposable = disposableOf(mounted)
      const liftTools = restrictForgeTools(invocation.agent)
      const entry: ForgeEntry = { agent: invocation.agent, liftTools, disposable, timer: setTimeout(() => undefined, 0), expiresAt }
      clearTimeout(entry.timer)
      this.sessions.set(sessionID, entry)
      this.schedule(sessionID, entry)
      this.notifyChange()
      if (requirement) await this.followup(invocation.agent, requirement)
      return { kind: 'success', text: `插件创作已开启，仅当前会话可用，两小时后自动收回。再次输入 /${this.commandName} 可提前结束。` }
    } catch (error) {
      await this.exit(sessionID, true, 'manual')
      return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
    }
  }

  async extend(sessionID: string): Promise<void> {
    const entry = this.sessions.get(sessionID)
    const token = this.options.readSession()?.token
    if (!entry || !token) throw new Error('当前创作会话已结束，请重新开启')
    const response = await this.fetchImpl(`${this.serverUrl}/internal/v1/session/${encodeURIComponent(sessionID)}/mode/extend`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    })
    const payload = await response.json().catch(() => undefined) as { expiresAt?: string, error?: { message?: string } } | undefined
    if (!response.ok || !payload?.expiresAt) throw new Error(payload?.error?.message ?? '暂时无法延长，请稍后重试')
    entry.expiresAt = payload.expiresAt
    this.schedule(sessionID, entry)
    this.notifyChange()
  }

  async exit(sessionID: string, synchronize: boolean, reason: ForgeEndReason = 'manual'): Promise<void> {
    const entry = this.sessions.get(sessionID)
    this.sessions.delete(sessionID)
    this.notifyChange()
    if (entry) {
      clearTimeout(entry.timer)
      if (entry.warningTimer) clearTimeout(entry.warningTimer)
      entry.liftTools?.()
      try { await entry.disposable?.dispose() } catch { /* Already disposed by the host. */ }
    }
    if (reason !== 'disposed') void this.publishEnd(sessionID, reason)
    if (!synchronize || this.stopped) return
    const token = this.options.readSession()?.token
    if (!token) return
    try { await this.setMode(sessionID, false, token) } catch { /* Edge expiry remains the authoritative fallback. */ }
  }

  private async followup(agent: ForgeAgent, requirement: string): Promise<void> {
    const names = ['eais-plugin-starter', 'eais-plugin-data', 'eais-plugin-ui', 'eais-plugin-check', 'eais-plugin-review']
    this.instructions ??= Promise.all(names.map(async name => {
      const path = fileURLToPath(new URL(`../../skills/${name}/SKILL.md`, import.meta.url))
      const text = await readFile(path, 'utf8').catch(() => `请先用 read 阅读 ${path}，并严格遵守其中流程。`)
      return `\n\n## ${name}\n\n${text}`
    })).then(parts => parts.join(''))
    const instructions = await this.instructions
    agent.followup?.(createUserMessage({
      content: [{ type: 'text', text: `${requirement}\n\n当前会话已开启插件创作。以下五份创作说明直接生效，不要把技能当作工具查找：${instructions}` }],
      source: { kind: 'user' },
    }))
  }

  private schedule(sessionID: string, entry: ForgeEntry): void {
    clearTimeout(entry.timer)
    if (entry.warningTimer) clearTimeout(entry.warningTimer)
    const remaining = Math.max(0, Date.parse(entry.expiresAt) - Date.now())
    entry.timer = setTimeout(() => { void this.exit(sessionID, true, 'expired') }, remaining)
    entry.warningTimer = setTimeout(() => { this.notifyChange() }, Math.max(0, remaining - FORGE_WARNING_MS))
  }

  private notifyChange(): void {
    this.changeListener?.()
  }

  private async publishEnd(sessionID: string, reason: ForgeEndReason): Promise<void> {
    this.notices.set(sessionID, reason === 'expired'
      ? '创作时间已结束，临时工具已收回，已保存的内容不受影响。'
      : reason === 'installed'
        ? '插件已装好，创作模式已结束，临时工具已收回。'
        : '插件创作已结束，临时工具已收回。')
  }

  private async setMode(sessionID: string, forge: boolean, token: string): Promise<string> {
    const response = await this.fetchImpl(`${this.serverUrl}/internal/v1/session/${encodeURIComponent(sessionID)}/mode`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ mode: forge ? 'forge' : 'normal' }),
    })
    const payload = await response.json().catch(() => undefined) as { expiresAt?: string } | undefined
    if (!response.ok) throw new Error(`无法${forge ? '开启' : '结束'}插件创作（HTTP ${response.status}）`)
    return forge ? payload?.expiresAt ?? new Date(Date.now() + FORGE_TTL_MS).toISOString() : ''
  }
}

function restrictForgeTools(agent: ForgeAgent): (() => void) | undefined {
  const tools = agent.ctx.tools
  if (!tools) return undefined
  const available = new Set(tools.schemas().map(schema => schema.name))
  const allow = FORGE_GLOBAL_TOOLS.filter(name => available.has(name))
  return allow.length > 0 ? tools.restrict({ allow }) : undefined
}

function disposableOf(value: unknown): { dispose(): unknown } | undefined {
  if (typeof value === 'function') return { dispose: () => value() }
  if (typeof value === 'object' && value !== null && 'dispose' in value) return value as { dispose: () => unknown }
  return undefined
}
