import { CardApiError } from './cards/api.js'

export interface EaisDataCall {
  code: string
  params?: Record<string, unknown>
  detail?: 'auto' | 'inline' | 'full' | 'digest'
}

export interface EaisDataResult {
  task_id: string
  action: string
  columns: Array<Record<string, unknown>>
  rows: Array<Record<string, unknown>>
  digest?: Record<string, unknown>
  total: number
  truncated: boolean
  next_offset?: number
  next_cursor?: string
  delivery: 'inline' | 'digest'
}

export interface EaisDataOptions {
  /** Same-origin Host route that proxies the query with the employee card. */
  endpoint?: string
  fetchImpl?: typeof fetch
}

interface DataContext {
  fiber?: {
    name?: string
    entry?: { options?: { name?: string } }
  }
  on?(event: string, listener: (...args: any[]) => unknown): unknown
}

export class EaisDataService {
  private readonly endpoint: string
  private readonly requests = new Map<string, AbortController>()

  constructor(private readonly packageName: string, private readonly options: EaisDataOptions) {
    this.endpoint = options.endpoint ?? '/eais/data/query'
  }

  async call(input: EaisDataCall): Promise<EaisDataResult> {
    if (!input.code || input.code.length > 128) throw new CardApiError('E_FIELD_UNKNOWN', '业务动作编号无效', 400)
    this.requests.get(input.code)?.abort()
    const controller = new AbortController()
    this.requests.set(input.code, controller)
    try {
      const response = await (this.options.fetchImpl ?? fetch)(this.endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          packageName: this.packageName,
          code: input.code,
          params: input.params ?? {},
          detail: input.detail ?? 'auto',
        }),
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => undefined) as
        { error?: { code?: string, message?: string } } | undefined
      if (!response.ok) {
        throw new CardApiError(
          payload?.error?.code ?? 'E_DATA',
          payload?.error?.message ?? `取数失败（HTTP ${response.status}）`,
          response.status,
        )
      }
      return payload as EaisDataResult
    } finally {
      if (this.requests.get(input.code) === controller) this.requests.delete(input.code)
    }
  }
}

export function registerEaisData(ctx: DataContext, options: EaisDataOptions): void {
  ctx.on?.('internal/get', (pluginCtx: DataContext, name: string, _error: unknown, next: () => unknown) => {
    if (name === 'eaisData') {
      const packageName = pluginCtx.fiber?.entry?.options?.name ?? pluginCtx.fiber?.name ?? ''
      return new EaisDataService(packageName, options)
    }
    return next()
  })
}
