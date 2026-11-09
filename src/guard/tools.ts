import type { GuardContext, GuardOptions } from './index.js'
import type { ForgeSessionController } from './forge-session.js'

export interface ToolPolicy {
  revision?: string
  source?: 'live' | 'stale'
  /** Tool names the server resolved as usable for this staff member. */
  allowed?: string[]
}

export interface ToolSchema {
  name: string
}

export interface ToolRegistry {
  restrict(filter: { allow?: string[]; deny?: string[] }): () => void
  schemas(scope?: unknown): ToolSchema[]
}

interface GuardToolsContext extends GuardContext {
  tools?: ToolRegistry
  on?: (event: string, listener: (payload: any) => unknown) => unknown
}

interface ControllerOptions {
  serverUrl?: string
  fetchImpl?: typeof fetch
  intervalMs?: number
}

interface AgentFiber {
  dispose(): unknown
}

interface AgentBinding {
  ctx: ToolRegistry
  fiber: AgentFiber
  disposer?: () => void
  signature: string
  allNames: string[]
}

interface AgentContext {
  inject(names: string[], callback: (ctx: { tools: ToolRegistry }) => unknown): AgentFiber
}

interface Agent {
  ctx: AgentContext
  session?: { id: unknown }
}

interface FilterPayload {
  revision?: unknown
  allowedTools?: unknown
}

/**
 * Keeps the client-side tool registry aligned with the server-side whitelist.
 *
 * The controller asks the edge for the tool names this staff member may use and
 * masks everything else out of the agent's registry. It never builds its own
 * policy: `POST /software/tool-filter` runs the same resolver as the request
 * path, so the two layers cannot disagree.
 */
export class ToolPolicyController {
  private timer?: ReturnType<typeof setTimeout>
  private stopped = false
  private pending?: Promise<void>
  private policy?: ToolPolicy
  private forge?: ForgeSessionController
  private readonly forgePolicies = new Map<string, ToolPolicy>()
  private reconnectMarker = ''
  private readonly bindings = new Map<Agent, AgentBinding>()
  private readonly listeners: Array<() => unknown> = []
  private readonly serverUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly intervalMs: number

  constructor(private readonly ctx: GuardToolsContext, private readonly config: GuardOptions, options: ControllerOptions = {}) {
    this.serverUrl = (options.serverUrl ?? config.serverUrl ?? 'http://127.0.0.1:18080').replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.intervalMs = options.intervalMs ?? 60_000
  }

  setForgeController(forge: ForgeSessionController): void {
    this.forge = forge
    forge.onChange(() => { void this.refresh() })
  }

  async start(): Promise<void> {
    this.listen('agent/created', ({ agent }: { agent: Agent }) => this.attach(agent))
    this.listen('agent/disposed', ({ agent }: { agent: Agent }) => this.detach(agent))
    this.listen('tools/change', () => this.refresh())
    await this.restorePolicy()
    // A refresh needs an agent registry to enumerate names; agents created
    // later trigger one from `attach`.
    if (this.bindings.size > 0) await this.refresh()
    this.schedule()
  }

  private listen(event: string, listener: (payload: any) => unknown): void {
    const disposer = this.ctx.on?.(event, listener)
    if (typeof disposer === 'function') {
      this.listeners.push(disposer as () => unknown)
      return
    }
    if (disposer && typeof (disposer as { dispose?: unknown }).dispose === 'function') {
      this.listeners.push(() => (disposer as { dispose: () => unknown }).dispose())
    }
  }

  private async restorePolicy(): Promise<void> {
    try {
      const settings = await this.ctx.settingsController?.get?.<{ guardToolPolicy?: ToolPolicy }>('eais')
      const saved = settings?.guardToolPolicy
      if (saved && Array.isArray(saved.allowed)) {
        this.policy = { revision: saved.revision, allowed: saved.allowed, source: 'stale' }
      }
    } catch {
      // A missing or unreadable local cache simply means "no local mask yet".
    }
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    for (const dispose of this.listeners.splice(0)) {
      try {
        dispose()
      } catch {
        // A listener that is already gone must not block the remaining cleanup.
      }
    }
    for (const binding of this.bindings.values()) {
      binding.disposer?.()
      binding.fiber.dispose()
    }
    this.bindings.clear()
  }

  private schedule(): void {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.refresh().finally(() => this.schedule())
    }, this.intervalMs)
  }

  private attach(agent: Agent): void {
    if (this.bindings.has(agent)) return
    const binding: AgentBinding = { ctx: undefined as unknown as ToolRegistry, fiber: undefined as unknown as AgentFiber, signature: '', allNames: [] }
    const fiber = agent.ctx.inject(['tools'], (runtimeCtx) => {
      binding.ctx = runtimeCtx.tools
      binding.allNames = this.names(binding)
      this.bindings.set(agent, binding)
      this.applyToAgent(agent)
      // The first refresh needs the agent's registry, which only exists now.
      void this.refresh()
    })
    binding.fiber = fiber
  }

  private detach(agent: Agent): void {
    const binding = this.bindings.get(agent)
    if (!binding) return
    binding.disposer?.()
    binding.fiber.dispose()
    this.bindings.delete(agent)
  }

  private async token(): Promise<string | undefined> {
    try {
      const resolved = await this.ctx.credentials.resolve('EAIS_TOKEN')
      if (typeof resolved === 'string') return resolved || undefined
      return typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined
    } catch {
      return undefined
    }
  }

  private async readReconnectMarker(): Promise<string> {
    try {
      const controller = this.ctx.settingsController
      if (!controller?.get) return ''
      const value = await controller.get<{ mcpReconnectRequestedAt?: string }>('eais')
      return value?.mcpReconnectRequestedAt ?? ''
    } catch {
      return ''
    }
  }

  private names(binding: AgentBinding): string[] {
    try {
      return binding.ctx.schemas().map((schema) => schema.name).sort()
    } catch {
      return []
    }
  }

  private availableNames(binding: AgentBinding): string[] {
    const names = new Set(binding.allNames)
    for (const name of this.names(binding)) names.add(name)
    binding.allNames = [...names].sort()
    return binding.allNames
  }

  /** Union of every tool name the attached agents can see. */
  private visibleNames(): string[] {
    const names = new Set<string>()
    for (const binding of this.bindings.values()) {
      for (const name of this.availableNames(binding)) names.add(name)
    }
    return [...names].sort()
  }

  private applyToAgent(agent: Agent): void {
    const binding = this.bindings.get(agent)
    if (!binding) return
    const sessionID = String(agent.session?.id ?? '')
    const forging = this.forge?.isForge(sessionID) === true
    const policy = forging ? this.forgePolicies.get(sessionID) : this.policy
    const names = this.availableNames(binding)
    const allowed = policy?.allowed
    const signature = JSON.stringify([allowed ?? null, names, this.reconnectMarker, forging])
    if (signature === binding.signature) return
    binding.signature = signature
    const permitted = new Set(allowed ?? [])
    const blocked = names.filter((name) => name !== 'run_code' && !permitted.has(name))
    binding.disposer?.()
    binding.disposer = policy ? binding.ctx.restrict({ deny: blocked }) : undefined
    console.info('[eais] guard tool policy applied', { allowed: permitted.size, deny: blocked.length, forge: forging })
  }

  private async fetchPolicy(names: string[], token: string, sessionID = ''): Promise<ToolPolicy | undefined> {
    const response = await this.fetchImpl(`${this.serverUrl}/software/tool-filter`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ names, session_id: sessionID }),
    })
    if (!response.ok) return undefined
    const payload = (await response.json()) as FilterPayload
    if (!Array.isArray(payload.allowedTools)) return undefined
    return {
      revision: typeof payload.revision === 'string' ? payload.revision : undefined,
      allowed: payload.allowedTools.filter((value): value is string => typeof value === 'string'),
      source: 'live',
    }
  }

  async refresh(): Promise<void> {
    if (this.stopped) return
    // Concurrent callers join the in-flight refresh instead of being dropped,
    // so an agent/created hook and a manual refresh cannot race each other.
    if (!this.pending) {
      this.pending = this.doRefresh().finally(() => {
        this.pending = undefined
      })
    }
    return this.pending
  }

  private async doRefresh(): Promise<void> {
    const token = await this.token()
    const names = this.visibleNames()
    let live: ToolPolicy | undefined
    if (token && names.length > 0) {
      try {
        live = await this.fetchPolicy(names, token)
      } catch {
        // The last successful restriction remains active.
      }
    }
    if (live) {
      this.policy = live
      try {
        const controller = this.ctx.settingsController
        if (controller?.get && controller.update) {
          const current = await controller.get<Record<string, unknown>>('eais') ?? {}
          await controller.update('eais', { ...current, guardToolPolicy: live }, undefined)
        }
      } catch {
        // Persistence is best effort; the in-memory mask is authoritative.
      }
    } else if (this.policy) {
      this.policy = { ...this.policy, source: 'stale' }
    }
    this.reconnectMarker = await this.readReconnectMarker()
    for (const agent of this.bindings.keys()) {
      const sessionID = String(agent.session?.id ?? '')
      if (token && this.forge?.isForge(sessionID)) {
        try {
          const binding = this.bindings.get(agent)
          const agentNames = binding ? this.availableNames(binding) : names
          const policy = await this.fetchPolicy(agentNames, token, sessionID)
          if (policy) this.forgePolicies.set(sessionID, policy)
        } catch {
          const previous = this.forgePolicies.get(sessionID)
          if (previous) this.forgePolicies.set(sessionID, { ...previous, source: 'stale' })
        }
      } else {
        this.forgePolicies.delete(sessionID)
      }
      try {
        this.applyToAgent(agent)
      } catch (error) {
        console.error('[eais] guard tool policy failed closed check required', error)
      }
    }
    void this.reportRegistryStatus(token)
  }

  private async reportRegistryStatus(token?: string): Promise<void> {
    if (!token || !this.policy) return
    const allowed = new Set<string>()
    const denied = new Set<string>()
    const permitted = new Set(this.policy.allowed ?? [])
    for (const binding of this.bindings.values()) {
      for (const name of this.names(binding)) {
        if (permitted.has(name)) allowed.add(name)
        else denied.add(name)
      }
    }
    if (allowed.size === 0 && denied.size === 0) return
    try {
      await this.fetchImpl(`${this.serverUrl}/software/tool-registry-status`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          device_id: this.config.installationId ?? this.config.deviceName ?? 'dsh',
          plugin_version: '0.1.0',
          policy_revision: this.policy.revision ?? '',
          policy_source: this.policy.source ?? 'live',
          allowed: [...allowed].sort(),
          denied: [...denied].sort(),
        }),
      })
    } catch {
      // Heartbeats and reconciliation reports must not weaken local restrictions.
    }
  }
}
