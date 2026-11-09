import type { CardColumn, DraftField, DraftRisk } from './types.js'

export class CardApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'CardApiError'
    this.code = code
    this.status = status
  }
}

export interface CardApiOptions {
  serverUrl: string
  resolveToken: () => Promise<string | undefined>
  fetchImpl?: typeof fetch
}

export interface RowsQuery {
  offset?: number
  cursor?: string
  limit?: number
  sort?: string
  desc?: boolean
  filter?: string
}

export interface RowsPage {
  columns: CardColumn[]
  rows: Record<string, unknown>[]
  total: number
  matched: number
  rows_returned: number
  offset: number
  limit: number
  complete: boolean
  page_complete?: boolean
  dataset_complete?: boolean
  total_known?: boolean
  source_mode?: 'task' | 'cursor'
  next_cursor?: string
  action?: string
  action_name?: string
  title?: string
}

export interface ExportJob {
  job_id: string
  state: string
}

export interface JobStatus extends ExportJob {
  result: { file_id?: string, rows?: number, sha256?: string, error?: string }
}

export interface ConfirmDraft {
  confirm_id: string
  status: string
  action: string
  action_name?: string
  action_say?: string
  risk: DraftRisk
  fields: DraftField[]
  message?: string
  task_id?: string
  result?: Record<string, unknown>
  expires_at?: string
}

export class CardApi {
  private readonly base: string
  private readonly resolveToken: () => Promise<string | undefined>
  private readonly fetchImpl: typeof fetch

  constructor(options: CardApiOptions) {
    this.base = options.serverUrl.replace(/\/+$/, '')
    this.resolveToken = options.resolveToken
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
  }

  async rows(viewId: string, query: RowsQuery = {}, token?: string): Promise<RowsPage> {
    return this.request<RowsPage>('POST', `/views/${encodeURIComponent(viewId)}/rows`, {
      offset: query.offset ?? 0,
      cursor: query.cursor ?? '',
      limit: query.limit ?? 50,
      sort: query.sort ?? '',
      desc: query.desc === true,
      filter: query.filter ?? '',
    }, token)
  }

  async export(viewId: string, token?: string): Promise<ExportJob> {
    return this.request<ExportJob>('POST', `/views/${encodeURIComponent(viewId)}/export`, {}, token)
  }

  async job(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>('GET', `/jobs/${encodeURIComponent(jobId)}`)
  }

  async download(fileId: string): Promise<Blob> {
    const token = await this.resolveToken()
    if (!token) throw new CardApiError('E_CARD_TOKEN', '员工卡不可用，请重新登录', 401)
    const response = await this.fetchImpl(this.base + `/files/${encodeURIComponent(fileId)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      throw new CardApiError('E_DOWNLOAD', `下载失败（HTTP ${response.status}）`, response.status)
    }
    return response.blob()
  }

  async confirmation(confirmId: string, token?: string): Promise<ConfirmDraft> {
    return this.request<ConfirmDraft>('GET', `/confirmations/${encodeURIComponent(confirmId)}`, undefined, token)
  }

  async decide(confirmId: string, decision: 'confirm' | 'cancel', params?: Record<string, unknown>, token?: string): Promise<ConfirmDraft> {
    return this.request<ConfirmDraft>('POST', `/confirmations/${encodeURIComponent(confirmId)}/decision`, {
      decision, params: params ?? {},
    }, token)
  }

  async confirmToken(confirmId: string): Promise<{ token: string; url: string }> {
    return this.request<{ token: string; url: string }>('POST', `/confirmations/${encodeURIComponent(confirmId)}/token`, {})
  }

  async viewToken(viewId: string): Promise<{ token: string; url: string }> {
    return this.request<{ token: string; url: string }>('POST', `/views/${encodeURIComponent(viewId)}/token`, {})
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>, scopedToken?: string): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    let url = this.base + path
    let requestBody = body
    if (scopedToken) {
      if (method === 'GET') {
        url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(scopedToken)
      } else {
        requestBody = { ...(body ?? {}), token: scopedToken }
      }
    } else {
      const token = await this.resolveToken()
      if (!token) throw new CardApiError('E_CARD_TOKEN', '员工卡不可用，请重新登录', 401)
      headers.authorization = `Bearer ${token}`
    }
    if (requestBody !== undefined) headers['content-type'] = 'application/json'
    const response = await this.fetchImpl(url, {
      method,
      headers,
      ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
    })
    const text = await response.text()
    let payload: unknown
    try {
      payload = text ? JSON.parse(text) : undefined
    } catch {
      payload = undefined
    }
    if (!response.ok) {
      const error = (payload as { error?: { code?: string; message?: string } } | undefined)?.error
      throw new CardApiError(error?.code ?? 'E_CARD', error?.message ?? `请求失败（HTTP ${response.status}）`, response.status)
    }
    return payload as T
  }
}
