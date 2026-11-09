import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FetchLike } from './api.js'

export type EaisDataDetail = 'auto' | 'inline' | 'full' | 'digest'

export interface EaisDataProxyInput {
  code: string
  params?: Record<string, unknown>
  detail?: EaisDataDetail
}

export interface EaisDataProxySession {
  serverUrl: string
  token: string
}

export interface EaisDataProxyResult {
  status: number
  body: unknown
  pluginNumber?: string
}

interface ErrorBody {
  error: {
    code: string
    message: string
  }
}

function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Resolve a plugin number and forward one data query through the Host session. */
export async function queryEaisData(
  session: EaisDataProxySession,
  packageName: string,
  input: EaisDataProxyInput,
  fetchImpl: FetchLike,
  cachedPluginNumber?: string,
): Promise<EaisDataProxyResult> {
  const base = session.serverUrl.replace(/\/+$/, '')
  let pluginNumber = cachedPluginNumber
  if (!pluginNumber) {
    const response = await fetchImpl(`${base}/plugins/resolve?package_name=${encodeURIComponent(packageName)}`, {
      headers: { authorization: `Bearer ${session.token}`, accept: 'application/json' },
    })
    const payload = await response.json().catch(() => undefined)
    if (!response.ok) {
      return { status: response.status, body: payload ?? errorBody('E_DATA', `插件身份查询失败（HTTP ${response.status}）`) }
    }
    pluginNumber = isRecord(payload) && typeof payload.pluginNo === 'string' ? payload.pluginNo : ''
    if (!pluginNumber) {
      return { status: 403, body: errorBody('E_PLUGIN_IDENTITY', '当前插件没有登记插件号') }
    }
  }

  const response = await fetchImpl(`${base}/data/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.token}`,
      accept: 'application/json',
      'content-type': 'application/json',
      'x-eais-plugin': pluginNumber,
    },
    body: JSON.stringify({
      code: input.code,
      params: input.params ?? {},
      detail: input.detail ?? 'auto',
    }),
  })
  const payload = await response.json().catch(() => undefined)
  if (!response.ok) {
    return { status: response.status, body: payload ?? errorBody('E_DATA', `取数失败（HTTP ${response.status}）`) }
  }
  return { status: response.status, body: payload, pluginNumber }
}

/** Read one bounded JSON request body. */
export async function readJsonBody(req: IncomingMessage, limitBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limitBytes) throw new Error('请求体过大')
    chunks.push(buffer)
  }
  if (size === 0) throw new Error('请求体为空')
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/** Write one JSON response with no-store semantics. */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}
