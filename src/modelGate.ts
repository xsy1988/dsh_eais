import type { StreamChunk } from './llm.js'
import type { HostContext } from './port.js'

export const DEFAULT_ENTERPRISE_PRESETS = ['eais-chat']
export const DEFAULT_ENTERPRISE_PROVIDERS = ['eais']

/** Which model providers each kind of session may call. */
export interface ModelGatePolicy {
  /** Agent preset ids that count as 企业模式. */
  enterprisePresets: string[]
  /** Provider routes that only an enterprise session may call. */
  enterpriseProviders: string[]
  /** Preset assumed when a session carries none (legacy sessions). */
  defaultPreset?: string
}

interface SessionLike {
  header?: { agentPreset?: unknown }
}

interface SessionStore {
  get?(sessionId: string): SessionLike | undefined
}

interface ProjectionStore {
  stateOf?(session: SessionLike, key: string): unknown
}

interface PresetRegistry {
  defaultId?: unknown
}

interface StreamOptions {
  provider?: unknown
  model?: unknown
  sessionId?: unknown
}

type StreamListener = (options: StreamOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>

/**
 * Enforce the model/mode split at the one seam every model call passes through.
 * The picker stays a catalogue of every installed provider, but a call is only
 * dispatched when the session's agent preset agrees with the provider:
 * enterprise sessions may only reach EAIS, every other preset may not.
 */
export function installModelGate(ctx: HostContext, policy: ModelGatePolicy): () => void {
  const presets = policy.enterprisePresets.filter((value) => value.length > 0)
  const providers = policy.enterpriseProviders.filter((value) => value.length > 0)
  if (presets.length === 0 || providers.length === 0) return () => undefined

  const listener: StreamListener = (options, next) => {
    const provider = typeof options.provider === 'string' ? options.provider : ''
    if (provider.length === 0) return next()
    const preset = sessionPreset(ctx, options.sessionId, policy)
    const enterprise = preset !== undefined && presets.includes(preset)
    const enterpriseProvider = providers.includes(provider)
    if (enterprise && !enterpriseProvider) {
      return rejected(
        `企业模式下只能调用 EAIS 提供的模型：当前选择的是「${provider}」，请切换到「EAIS 企业模型」。`,
      )
    }
    if (!enterprise && enterpriseProvider) {
      return rejected(
        `当前会话不是企业模式（${preset ?? '未指定模式'}），不能调用 EAIS 企业模型。`,
      )
    }
    return next()
  }

  const dispose = ctx.on('llm/stream', listener as (...args: unknown[]) => void)
  return () => {
    if (typeof dispose === 'function') (dispose as () => void)()
  }
}

function sessionPreset(ctx: HostContext, sessionId: unknown, policy: ModelGatePolicy): string | undefined {
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    const session = ctx.get?.<SessionStore>('sessions')?.get?.(sessionId)
    if (session !== undefined) {
      const projected = ctx.get?.<ProjectionStore>('sessionProjections')?.stateOf?.(session, 'agentPreset')
      if (typeof projected === 'string' && projected.length > 0) return projected
      const header = session.header?.agentPreset
      if (typeof header === 'string' && header.length > 0) return header
    }
  }
  const registry = ctx.get?.<PresetRegistry>('agentPresets')
  if (typeof registry?.defaultId === 'string' && registry.defaultId.length > 0) return registry.defaultId
  return policy.defaultPreset
}

async function* rejected(message: string): AsyncGenerator<StreamChunk> {
  yield {
    type: 'finish',
    reason: { kind: 'error', failure: { code: 'E_POLICY', message } },
  } as unknown as StreamChunk
}
