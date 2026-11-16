import {
  EAIS_API_VERSION,
  EaisError,
  type EaisAttachmentCapability,
  type EaisLoginResponse,
  type EaisMe,
  type EaisModel,
  type EaisStaff,
} from './contracts.js'

export type FetchLike = typeof fetch

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function parseUrl(value: string, field: string): URL {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    const kind = typeof value === 'object' && value !== null && 'constructor' in value
      ? String((value as { constructor?: { name?: string } }).constructor?.name ?? typeof value)
      : typeof value
    throw new EaisError('E_SERVER_URL', `${field} 地址无效（${kind}）`)
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new EaisError('E_SERVER_URL', `${field} 只支持 HTTP(S)`)
  }
  if (url.username || url.password) {
    throw new EaisError('E_SERVER_URL', `${field} 不能包含用户名或密码`)
  }
  return url
}

export function normalizeServerUrl(value: string): string {
  const url = parseUrl(value, 'EAIS')
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

export function endpoint(baseURL: string, path: string): string {
  return `${normalizeServerUrl(baseURL)}${path}`
}

export function originOf(value: string): string {
  return parseUrl(value, 'EAIS').origin
}

export interface ParseMeOptions {
  /** The configured EAIS server URL; its origin is always allowed. */
  serverUrl?: string
  /** Additional origins explicitly allowed by the operator. */
  allowedOrigins?: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EaisError('E_API_RESPONSE', `EAIS 响应缺少 ${field}`)
  }
  return value
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EaisError('E_API_RESPONSE', `EAIS 响应中的 ${field} 无效`)
  }
  return value
}

function allowedOrigins(options: ParseMeOptions): Set<string> {
  const origins = new Set<string>()
  if (options.serverUrl) origins.add(originOf(options.serverUrl))
  for (const value of options.allowedOrigins ?? []) origins.add(originOf(value))
  return origins
}

function parseApiUrl(value: unknown, field: string, origins: Set<string>): string {
  const raw = requiredString(value, field)
  let url: URL
  try {
    url = parseUrl(raw, `EAIS 响应中的 ${field}`)
  } catch {
    throw new EaisError('E_API_RESPONSE', `EAIS 响应中的 ${field} 地址无效`)
  }
  if (origins.size > 0 && !origins.has(url.origin)) {
    throw new EaisError('E_API_RESPONSE', `EAIS 响应中的 ${field} 不在允许的来源内`)
  }
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

function parseStaff(value: unknown): EaisStaff {
  if (!isRecord(value)) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 响应缺少员工信息')
  }
  return {
    no: requiredString(value.no, 'staff.no'),
    name: requiredString(value.name, 'staff.name'),
    dept: requiredString(value.dept, 'staff.dept'),
  }
}

function parseModel(value: unknown): EaisModel {
  if (!isRecord(value)) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 模型项无效')
  }
  const reasoning = value.reasoning
  if (reasoning !== false && (!Array.isArray(reasoning) || reasoning.some((item) => typeof item !== 'string'))) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 模型思考挡位无效')
  }
  return {
    id: requiredString(value.id, 'llm.models.id'),
    name: requiredString(value.name, 'llm.models.name'),
    contextWindow: requiredNumber(value.contextWindow, 'llm.models.contextWindow'),
    maxTokens: requiredNumber(value.maxTokens, 'llm.models.maxTokens'),
    reasoning: reasoning as false | string[],
  }
}

export function parseMe(value: unknown, options: ParseMeOptions = {}): EaisMe {
  if (!isRecord(value)) {
    throw new EaisError('E_API_RESPONSE', 'EAIS /me 响应无效')
  }
  const apiVersion = requiredString(value.apiVersion, 'apiVersion')
  if (apiVersion !== EAIS_API_VERSION) {
    throw new EaisError('E_API_VERSION', `EAIS 接口版本 ${apiVersion} 与插件所需版本 ${EAIS_API_VERSION} 不匹配`)
  }
  if (!isRecord(value.card) || !isRecord(value.llm)) {
    throw new EaisError('E_API_RESPONSE', 'EAIS /me 响应结构不完整')
  }
  if (!Array.isArray(value.llm.models)) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 模型清单无效')
  }
  const expiresAt = requiredString(value.card.expiresAt, 'card.expiresAt')
  if (!Number.isFinite(Date.parse(expiresAt))) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 卡有效期无效')
  }
  const ttl = requiredNumber(value.card.ttl, 'card.ttl')
  if (ttl <= 0) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 配置 TTL 必须大于零')
  }

  const origins = allowedOrigins(options)
  const mcp = value.mcp === undefined || value.mcp === null
    ? undefined
    : parseMcp(value.mcp, origins)
  const ui = value.ui === undefined || value.ui === null
    ? undefined
    : parseUi(value.ui, origins)
  const attachments = value.attachments === undefined || value.attachments === null
    ? undefined
    : parseAttachments(value.attachments)

  return {
    apiVersion: EAIS_API_VERSION,
    staff: parseStaff(value.staff),
    card: { expiresAt, ttl },
    llm: {
      baseURL: parseApiUrl(value.llm.baseURL, 'llm.baseURL', origins),
      models: value.llm.models.map(parseModel),
    },
    ...(mcp ? { mcp } : {}),
    ...(ui ? { ui } : {}),
    ...(attachments ? { attachments } : {}),
  }
}

function parseAttachments(value: unknown): EaisAttachmentCapability {
  if (!isRecord(value) || value.enabled !== true || !Array.isArray(value.types) ||
    value.types.some(item => typeof item !== 'string')) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 附件能力声明无效')
  }
  return {
    enabled: true,
    types: value.types,
    maxFileBytes: requiredNumber(value.maxFileBytes, 'attachments.maxFileBytes'),
    maxUnits: requiredNumber(value.maxUnits, 'attachments.maxUnits'),
    maxMessageAttachments: requiredNumber(value.maxMessageAttachments, 'attachments.maxMessageAttachments'),
    maxSliceChars: requiredNumber(value.maxSliceChars, 'attachments.maxSliceChars'),
  }
}

function parseMcp(value: unknown, origins: Set<string>): NonNullable<EaisMe['mcp']> {
  if (!isRecord(value)) {
    throw new EaisError('E_API_RESPONSE', 'EAIS MCP 能力声明无效')
  }
  const serverName = requiredString(value.serverName, 'mcp.serverName')
  if (serverName !== 'eais') {
    throw new EaisError('E_API_RESPONSE', 'EAIS MCP serverName 必须为 eais')
  }
  return {
    url: parseApiUrl(value.url, 'mcp.url', origins),
    serverName: 'eais',
    ...(typeof value.revision === 'string' && value.revision ? { revision: value.revision } : {}),
  }
}

function parseUi(value: unknown, origins: Set<string>): NonNullable<EaisMe['ui']> {
  if (!isRecord(value)) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 界面能力声明无效')
  }
  return {
    panelBase: parseApiUrl(value.panelBase, 'ui.panelBase', origins),
  }
}

async function responseFailure(response: Response, fallbackCode: string): Promise<EaisError> {
  let code = response.status === 401 || response.status === 403 ? 'E_POLICY' : fallbackCode
  let message = `EAIS 请求失败（HTTP ${response.status}）`
  try {
    const body: unknown = await response.json()
    if (isRecord(body)) {
      const nested = isRecord(body.error) ? body.error : body
      if (typeof nested.code === 'string' && nested.code) code = nested.code
      if (typeof nested.message === 'string' && nested.message) message = nested.message
    }
  } catch {
  }
  return new EaisError(code, message, response.status)
}

async function request(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  fallbackCode: string,
): Promise<Response> {
  const response = await fetchImpl(url, {
    ...init,
    credentials: 'omit',
    headers: {
      accept: 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok) throw await responseFailure(response, fallbackCode)
  return response
}

export interface LoginInput {
  staffNo: string
  password: string
  installationId?: string
  deviceName?: string
}

export async function login(
  fetchImpl: FetchLike,
  serverUrl: string,
  input: LoginInput,
  signal?: AbortSignal,
): Promise<EaisLoginResponse> {
  const response = await request(fetchImpl, endpoint(serverUrl, '/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      staffNo: input.staffNo,
      password: input.password,
      ...(input.installationId ? { installationId: input.installationId } : {}),
      ...(input.deviceName ? { deviceName: input.deviceName } : {}),
    }),
    signal,
  }, 'E_LOGIN_FAILED')
  const body: unknown = await response.json()
  if (!isRecord(body)) throw new EaisError('E_API_RESPONSE', 'EAIS 登录响应无效')
  const expiresAt = requiredString(body.expiresAt, 'expiresAt')
  if (!Number.isFinite(Date.parse(expiresAt))) {
    throw new EaisError('E_API_RESPONSE', 'EAIS 卡有效期无效')
  }
  return {
    token: requiredString(body.token, 'token'),
    expiresAt,
    staff: parseStaff(body.staff),
  }
}

export async function fetchMe(
  fetchImpl: FetchLike,
  serverUrl: string,
  token: string,
  signal?: AbortSignal,
  allowedOrigins?: readonly string[],
): Promise<EaisMe> {
  const response = await request(fetchImpl, endpoint(serverUrl, '/me'), {
    headers: { authorization: `Bearer ${token}` },
    signal,
  }, 'E_ME_FAILED')
  return parseMe(await response.json(), { serverUrl, allowedOrigins })
}

export interface ChangePasswordInput {
  staffNo: string
  currentPassword: string
  newPassword: string
}

export async function changePassword(
  fetchImpl: FetchLike,
  serverUrl: string,
  input: ChangePasswordInput,
  signal?: AbortSignal,
): Promise<void> {
  await request(fetchImpl, endpoint(serverUrl, '/auth/password'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  }, 'E_PASSWORD_CHANGE_FAILED')
}

export async function revoke(
  fetchImpl: FetchLike,
  serverUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  await request(fetchImpl, endpoint(serverUrl, '/auth/revoke'), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    signal,
  }, 'E_REVOKE_FAILED')
}
