export const EAIS_TOKEN_REF = 'EAIS_TOKEN'
export const EAIS_SETTINGS_KEY = 'eais'
export const EAIS_API_VERSION = '1'
export const EAIS_PROVIDER = 'eais'

export type EaisStatus =
  | 'unconfigured'
  | 'logged-out'
  | 'connecting'
  | 'ready'
  | 'degraded'
  | 'expired'
  | 'failed'

export type CapabilityPhase = 'idle' | 'mounting' | 'ready' | 'disabled' | 'failed'
export type UiCapability = 'card' | 'panel' | 'buttons'
export type UiCapabilityPhase = 'idle' | 'ready' | 'disabled' | 'failed'

export interface EaisStaff {
  no: string
  name: string
  dept: string
}

export interface EaisModel {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  reasoning: false | string[]
}

export interface EaisAttachmentCapability {
  enabled: true
  types: string[]
  maxFileBytes: number
  maxUnits: number
  maxMessageAttachments: number
  maxSliceChars: number
}

export interface EaisMe {
  apiVersion: '1'
  staff: EaisStaff
  card: {
    expiresAt: string
    ttl: number
  }
  llm: {
    baseURL: string
    models: EaisModel[]
  }
  attachments?: EaisAttachmentCapability
  mcp?: {
    url: string
    serverName: 'eais'
    revision?: string
  }
  ui?: {
    panelBase: string
  }
}

export interface EaisLoginResponse {
  token: string
  expiresAt: string
  staff: EaisStaff
}

export interface EaisFailure {
  code: string
  message: string
}

export interface UiCapabilityState {
  phase: UiCapabilityPhase
  reason?: EaisFailure
}

export interface EaisPublicState {
  status: EaisStatus
  reason?: EaisFailure | null
  staff?: EaisStaff
  models: EaisModel[]
  expiresAt?: string
  panelBase?: string
  mcp: {
    phase: CapabilityPhase
    reason?: EaisFailure
  }
  llm: {
    phase: CapabilityPhase
    reason?: EaisFailure | null
  }
  ui: Record<UiCapability, UiCapabilityState>
  updatedAt: string
}

export interface EaisSettings {
  serverUrl?: string
  installationId?: string
  deviceName?: string
  state?: EaisPublicState
  /** Browser-to-Host logout request; the Host clears it after revoke/unset. */
  logoutRequestedAt?: string
  /** Browser-to-Host MCP reconnect request; the Host remounts MCP with the current card. */
  mcpReconnectRequestedAt?: string
  /** Guard lease/recall state persisted in the same settings namespace. */
  guardState?: unknown
  /** Last tool policy accepted from the server, kept for offline masking. */
  guardToolPolicy?: unknown
  pluginSources?: Record<string, string>
}

export interface EaisConfig {
  serverUrl?: string
  serverUrlReadOnly?: boolean
  /** Additional origins accepted from `/me` besides the configured server origin. */
  allowedOrigins?: string[]
  /** Block model calls that do not match the session's agent preset. */
  enforceModelMode?: boolean
  /** Agent preset ids treated as 企业模式. */
  enterprisePresets?: string[]
  /** Provider routes only an enterprise session may call. */
  enterpriseProviders?: string[]
  /** Preset assumed for sessions that carry none. */
  defaultPreset?: string
}

export class EaisError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, message: string, status?: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EaisError'
    this.code = code
    this.status = status
  }
}

export function failure(error: unknown, fallbackCode = 'E_EAIS_UNAVAILABLE'): EaisFailure {
  if (error instanceof EaisError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return { code: fallbackCode, message: error.message }
  }
  return { code: fallbackCode, message: String(error) }
}

export function emptyUiState(phase: UiCapabilityPhase = 'disabled'): EaisPublicState['ui'] {
  return {
    card: { phase },
    panel: { phase },
    buttons: { phase },
  }
}

export function initialPublicState(status: EaisStatus = 'logged-out'): EaisPublicState {
  return {
    status,
    reason: null,
    models: [],
    mcp: { phase: 'disabled' },
    llm: { phase: 'idle', reason: null },
    ui: emptyUiState(),
    updatedAt: new Date().toISOString(),
  }
}
