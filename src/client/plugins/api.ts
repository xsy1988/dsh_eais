export interface EmployeePlugin {
  pluginNo: string
  ownerStaffNo: string
  authorStaffNo: string
  relation?: 'mine' | 'maintainer' | 'shared'
  installed: boolean
  packageName: string
  displayName: string
  panelId: string
  successorStaffNo?: string
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
  fetchImpl?: typeof fetch
}

export class PluginApi {
  constructor(private readonly options: PluginApiOptions) {}

  async list(): Promise<EmployeePlugin[]> {
    const result = await this.request<{ items: EmployeePlugin[] }>('/eais/plugins/mine')
    return result.items ?? []
  }

  async events(pluginNo: string): Promise<PluginEvent[]> {
    const result = await this.request<{ items: PluginEvent[] }>(`/eais/plugins/events?pluginNo=${encodeURIComponent(pluginNo)}`)
    return result.items ?? []
  }

  async action(pluginNo: string, action: string, version = '', reason = '', displayName = ''): Promise<EmployeePlugin> {
    return this.request('/eais/plugins/action', { pluginNo, action, version, reason, display_name: displayName })
  }

  private async request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const response = await (this.options.fetchImpl ?? fetch)(path, {
      method: body ? 'POST' : 'GET',
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined
    if (!response.ok) throw new Error(payload?.error?.message ?? `请求失败（HTTP ${response.status}）`)
    return payload as T
  }
}

export class PluginArtifactApi {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async publish(pluginNo: string, successorStaffNo: string): Promise<void> {
    await this.request('/eais/plugins/publish', { pluginNo, successorStaffNo })
  }

  async install(pluginNo: string, version: string): Promise<void> {
    const result = await this.request<{ application?: string }>('/eais/plugins/install', { pluginNo, version })
    if (result.application === 'restart-required') throw new Error('安装已保存，重启 DSH 后即可打开')
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.fetchImpl(path, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined
    if (!response.ok) throw new Error(payload?.error?.message ?? `操作失败（HTTP ${response.status}）`)
    return payload as T
  }
}
