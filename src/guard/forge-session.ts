import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import type { EaisRuntimeSession } from '../adapter/index.js'

interface ForgeHostContext {
  commands?: { register(definition: unknown): unknown }
  on?(event: string, listener: (...args: any[]) => unknown): unknown
}

interface ForgeAgent {
  session: { id: unknown }
  ctx: {
    plugin(plugin: unknown, config: unknown): unknown
  }
}

interface ForgeCommandInvocation {
  agent: ForgeAgent
}

interface ForgeEntry {
  disposable?: { dispose(): unknown }
  timer: ReturnType<typeof setTimeout>
}

const sharedForge = globalThis as { __eaisPluginForgeSessions?: Map<string, ForgeEntry> }

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
  private changeListener?: () => void

  constructor(private readonly ctx: ForgeHostContext, private readonly options: ForgeSessionOptions) {
    sharedForge.__eaisPluginForgeSessions = this.sessions
    this.serverUrl = (options.serverUrl ?? 'http://127.0.0.1:18080').replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  start(): () => void {
    const disposers: Array<() => unknown> = []
    for (const name of ['插件创作', 'plugin-forge']) {
      try {
        const registration = this.ctx.commands?.register({
          name,
          description: '开启或结束当前会话的插件创作',
          handler: (invocation: ForgeCommandInvocation) => this.toggle(invocation),
        })
        if (typeof registration === 'function') disposers.push(() => registration())
      } catch (error) {
        if (name !== '插件创作') throw error
      }
    }
    const listener = this.ctx.on?.('agent/disposed', (payload: unknown) => {
      const agent = (payload as { agent?: ForgeAgent }).agent
      if (agent) void this.exit(String(agent.session.id), false)
    })
    if (typeof listener === 'function') disposers.push(() => listener())
    for (const [sessionID, entry] of this.sessions) {
      clearTimeout(entry.timer)
      entry.timer = setTimeout(() => { void this.exit(sessionID, true) }, 2 * 60 * 60 * 1000)
    }
    this.changeListener?.()
    return () => {
      this.stopped = true
      for (const dispose of disposers) void dispose()
      for (const entry of this.sessions.values()) clearTimeout(entry.timer)
    }
  }

  onChange(listener: () => void): void {
    this.changeListener = listener
  }

  isForge(sessionID: string): boolean {
    return this.sessions.has(sessionID)
  }

  session(): EaisRuntimeSession | undefined {
    return this.options.readSession()
  }

  request(path: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(this.serverUrl + path, init)
  }

  async toggle(invocation: ForgeCommandInvocation): Promise<{ kind: 'success' | 'error', text?: string }> {
    const sessionID = String(invocation.agent.session.id)
    if (this.isForge(sessionID)) {
      await this.exit(sessionID, true)
      return { kind: 'success', text: '已结束插件创作，执行工具已收回。' }
    }
    try {
      const session = this.options.readSession()
      if (!session?.me.mcp || !session.token) return { kind: 'error', text: '请先登录 EAIS，再开始插件创作。' }
      await this.setMode(sessionID, true, session.token)
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
      const timer = setTimeout(() => { void this.exit(sessionID, true) }, 2 * 60 * 60 * 1000)
      this.sessions.set(sessionID, { disposable, timer })
      this.changeListener?.()
      return { kind: 'success', text: '插件创作已开启，仅当前会话可用，两小时后自动收回。请先调用 eais-plugin-starter。' }
    } catch (error) {
      await this.exit(sessionID, true)
      return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
    }
  }

  async exit(sessionID: string, synchronize: boolean): Promise<void> {
    const entry = this.sessions.get(sessionID)
    this.sessions.delete(sessionID)
    this.changeListener?.()
    if (entry) {
      clearTimeout(entry.timer)
      try { await entry.disposable?.dispose() } catch { /* Already disposed by the host. */ }
    }
    if (!synchronize || this.stopped) return
    const token = this.options.readSession()?.token
    if (!token) return
    try { await this.setMode(sessionID, false, token) } catch { /* Edge expiry remains the authoritative fallback. */ }
  }

  private async setMode(sessionID: string, forge: boolean, token: string): Promise<void> {
    const response = await this.fetchImpl(`${this.serverUrl}/internal/v1/session/${encodeURIComponent(sessionID)}/mode`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ mode: forge ? 'forge' : 'normal' }),
    })
    if (!response.ok) throw new Error(`无法${forge ? '开启' : '结束'}插件创作（HTTP ${response.status}）`)
  }
}

function disposableOf(value: unknown): { dispose(): unknown } | undefined {
  if (typeof value === 'function') return { dispose: () => value() }
  if (typeof value === 'object' && value !== null && 'dispose' in value) return value as { dispose(): unknown }
  return undefined
}
