import { login, normalizeServerUrl, revoke, changePassword, type FetchLike } from './api.js'
import {
  EAIS_TOKEN_REF,
  EaisError,
  failure,
  initialPublicState,
  type EaisLoginResponse,
  type EaisPublicState,
} from './contracts.js'
import {
  readSettings,
  unwrapRemoteResult,
  writeSettings,
  type ResolvedCredential,
  type SettingsController,
} from './port.js'

export const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000

export interface CredentialSessionPort {
  resolve?(ref: string): ResolvedCredential | string | undefined | Promise<ResolvedCredential | string | undefined>
  set?(ref: string, value: string): unknown | Promise<unknown>
  unset?(ref: string): unknown | Promise<unknown>
}

/** Read the rc.2 `{ value, source }` result, tolerating an older string-returning provider. */
export function credentialValue(value: ResolvedCredential | string | undefined): string | undefined {
  if (typeof value === 'string') return value || undefined
  if (typeof value === 'object' && value !== null && typeof value.value === 'string' && value.value) {
    return value.value
  }
  return undefined
}

export interface LoginSessionInput {
  settings: SettingsController | undefined
  credentials: CredentialSessionPort
  fetchImpl: FetchLike
  serverUrl: string
  staffNo: string
  password: string
  installationId?: string
  deviceName?: string
  /** Optional connecting state persisted before the token becomes visible. */
  pendingState?: EaisPublicState | ((result: EaisLoginResponse) => EaisPublicState)
  signal?: AbortSignal
}

export interface LoginSessionResult extends EaisLoginResponse {
  serverUrl: string
}

/** Log in, persist the server URL first, and only then store the employee card. */
export async function loginSession(input: LoginSessionInput): Promise<LoginSessionResult> {
  const serverUrl = normalizeServerUrl(input.serverUrl)
  const existing = input.settings ? await readSettings(input.settings) : {}
  const installationId = input.installationId ?? existing.installationId ?? `dsh-${crypto.randomUUID()}`
  const deviceName = input.deviceName ?? existing.deviceName ?? 'DeepSeek Harness'
  const result = await login(input.fetchImpl, serverUrl, {
    staffNo: input.staffNo,
    password: input.password,
    installationId,
    deviceName,
  }, input.signal)
  const pendingState = typeof input.pendingState === 'function'
    ? input.pendingState(result)
    : input.pendingState
  await writeSettings(input.settings, {
    serverUrl,
    installationId,
    deviceName,
    logoutRequestedAt: '',
    ...(pendingState ? { state: pendingState } : {}),
  })
  if (!input.credentials.set) {
    throw new EaisError('E_CREDENTIALS_UNAVAILABLE', 'DSH 凭据通道不支持保存 EAIS 员工卡')
  }
  unwrapRemoteResult(await input.credentials.set(EAIS_TOKEN_REF, result.token))
  return { ...result, serverUrl }
}

export interface LogoutSessionInput {
  credentials: CredentialSessionPort
  fetchImpl: FetchLike
  serverUrl: string
  signal?: AbortSignal
}

/**
 * Revoke the current card before touching local credentials. A failed or
 * ambiguous revoke leaves the card in place so the UI never claims a logout
 * that the server did not confirm.
 */
export async function logoutSession(input: LogoutSessionInput): Promise<void> {
  if (!input.credentials.resolve) {
    throw new EaisError('E_REVOKE_UNAVAILABLE', 'DSH 凭据通道无法读取当前员工卡，不能安全退出')
  }
  const serverUrl = normalizeServerUrl(input.serverUrl)
  const token = credentialValue(await input.credentials.resolve(EAIS_TOKEN_REF))
  if (!token) {
    throw new EaisError('E_REVOKE_UNAVAILABLE', '当前没有可吊销的 EAIS 员工卡')
  }
  try {
    await revoke(input.fetchImpl, serverUrl, token, input.signal)
  } catch (error) {
    throw new EaisError(
      'E_REVOKE_UNCONFIRMED',
      `服务端吊销未确认：${failure(error, 'E_REVOKE_FAILED').message}`,
      error instanceof EaisError ? error.status : undefined,
      { cause: error },
    )
  }
  if (!input.credentials.unset) {
    throw new EaisError('E_REVOKE_UNAVAILABLE', 'DSH 凭据通道不支持清除 EAIS 员工卡')
  }
  unwrapRemoteResult(await input.credentials.unset(EAIS_TOKEN_REF))
}

export interface ChangePasswordSessionInput {
  settings: SettingsController | undefined
  credentials: CredentialSessionPort
  fetchImpl: FetchLike
  serverUrl: string
  staffNo: string
  currentPassword: string
  newPassword: string
  signal?: AbortSignal
}

/** Change the staff password, then drop the revoked local card. */
export async function changePasswordSession(input: ChangePasswordSessionInput): Promise<void> {
  const serverUrl = normalizeServerUrl(input.serverUrl)
  await changePassword(input.fetchImpl, serverUrl, {
    staffNo: input.staffNo,
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
  }, input.signal)
  if (input.credentials.unset) {
    unwrapRemoteResult(await input.credentials.unset(EAIS_TOKEN_REF))
  }
  await writeSettings(input.settings, { serverUrl, state: initialPublicState('logged-out'), logoutRequestedAt: '' })
}

export type ExpiryState = 'unknown' | 'valid' | 'expiring' | 'expired'

export function expiryState(expiresAt: string | undefined, now = Date.now()): ExpiryState {
  if (!expiresAt) return 'unknown'
  const timestamp = Date.parse(expiresAt)
  if (!Number.isFinite(timestamp)) return 'unknown'
  if (timestamp <= now) return 'expired'
  if (timestamp - now <= EXPIRY_WARNING_MS) return 'expiring'
  return 'valid'
}
