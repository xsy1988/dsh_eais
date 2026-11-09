export interface EmployeePlugin {
  pluginNo: string
  ownerStaffNo: string
  packageName: string
  status: 'trial' | 'private' | 'online' | 'offline'
  trialStartedAt: string
  trialExpiresAt: string
  renewalCount: number
  lastOpenedAt?: string
  currentVersion: string
  publishStatus: string
  privateUsed: number
  privateLimit: number
}

export interface PluginEvent {
  eventId: string
  pluginNo: string
  actor: string
  event: string
  detail: Record<string, unknown>
  createdAt: string
}

export interface PluginApiOptions {
  serverUrl: string
  resolveToken: () => Promise<string | undefined>
  fetchImpl?: typeof fetch
}

export class PluginApi {
  private readonly base: string
  constructor(private readonly options: PluginApiOptions) {
    this.base = options.serverUrl.replace(/\/+$/, '')
  }

  async list(): Promise<EmployeePlugin[]> {
    const result = await this.request<{ items: EmployeePlugin[] }>('/plugins/mine')
    return result.items ?? []
  }

  async events(pluginNo: string): Promise<PluginEvent[]> {
    const result = await this.request<{ items: PluginEvent[] }>(`/plugins/${encodeURIComponent(pluginNo)}/events`)
    return result.items ?? []
  }

  async action(pluginNo: string, action: string, version = '', reason = ''): Promise<EmployeePlugin> {
    return this.request(`/plugins/${encodeURIComponent(pluginNo)}/action`, { action, version, reason })
  }

  private async request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const token = await this.options.resolveToken()
    if (!token) throw new Error('请先登录 EAIS')
    const response = await (this.options.fetchImpl ?? fetch)(this.base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${token}`, accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify({ staff_no: '', ...body }) } : {}),
    })
    const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined
    if (!response.ok) throw new Error(payload?.error?.message ?? `请求失败（HTTP ${response.status}）`)
    return payload as T
  }
}
