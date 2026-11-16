import type {
  AdapterRegistrationHandle as DshAdapterRegistrationHandle,
  LlmAdapter as DshLlmAdapter,
  ContentBlock,
} from '@deepseek-ai/dsh-llm'
import {
  EAIS_SETTINGS_KEY,
  EaisError,
  type EaisSettings,
} from './contracts.js'

export type {
  ContentBlock,
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ReasoningEffortId,
  RequestMessage,
  StreamChunk,
  ToolCallId,
} from '@deepseek-ai/dsh-llm'

export interface Disposable {
  dispose(): void | Promise<void>
}

export interface AdapterRegistration extends Disposable {
  replaceProviders(providers: string[]): void
}

export interface SettingsNamespaceView {
  ns: string
  value: unknown
  revision: number
}

export interface SettingsDescribeValue {
  namespaces: SettingsNamespaceView[]
}

export interface SettingsController {
  get?<T = unknown>(namespace: string): T | undefined | Promise<T | undefined>
  describe?(): unknown | Promise<unknown>
  update(namespace: string, value: unknown, expectedRevision: number | undefined): unknown | Promise<unknown>
}

export interface SettingsPort {
  settingsController?: SettingsController
  remote?: {
    settings?: SettingsController
  }
  get?<T = unknown>(name: string): T | undefined
}

export function settingsControllerOf(ctx: SettingsPort): SettingsController {
  if (typeof ctx.get === 'function') {
    const direct = ctx.get<SettingsController>('settingsController')
    if (direct) return direct
    if (ctx.remote?.settings) return ctx.remote.settings
    throw new EaisError('E_SETTINGS_UNAVAILABLE', 'DSH 设置服务不可用')
  }
  if (ctx.settingsController) return ctx.settingsController
  if (ctx.remote?.settings) return ctx.remote.settings
  throw new EaisError('E_SETTINGS_UNAVAILABLE', 'DSH 设置服务不可用')
}

export function resolveVolatile<T>(value: T): T {
  if (typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function') {
    return (value as { get: () => T }).get()
  }
  return value
}

export function unwrapRemoteResult<T>(value: T): T {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return value
  const result = value as { ok: boolean; value?: unknown; error?: unknown }
  if (!result.ok) {
    const message = typeof result.error === 'object' && result.error !== null && 'message' in result.error
      ? String((result.error as { message: unknown }).message)
      : 'DSH 远程调用被拒绝'
    throw new EaisError('E_REMOTE_REJECTED', message)
  }
  return result.value as T
}

/** The rc.2 credentials seam resolves a reference to its value and origin. */
export interface ResolvedCredential {
  value: string
  source?: string
}

export interface HostCredentials {
  resolve(ref: string): ResolvedCredential | undefined | Promise<ResolvedCredential | undefined>
  set?(ref: string, value: string): void | Promise<void>
  unset?(ref: string): void | Promise<void>
}

export interface ClientCredentials {
  /** The browser side reads a value only when the Host Remote exposes it. */
  resolve?(ref: string): ResolvedCredential | string | undefined | Promise<ResolvedCredential | string | undefined>
  set(ref: string, value: string): void | Promise<void>
  unset(ref: string): void | Promise<void>
}

export interface Slot<T = unknown> {
  register(contribution: T): unknown
}

export interface HostContext {
  credentials: HostCredentials
  settingsController?: SettingsController
  llm: {
    registerAdapter(providers: string[], adapter: DshLlmAdapter): DshAdapterRegistrationHandle
    fileRequestText?(ref: Extract<ContentBlock, { type: 'file' }>['attachment']): string
  }
  agentDefaultModel?: {
    currentSelection?(): { provider?: string; model?: string } | undefined
    getSelection?(): { provider?: string; model?: string } | undefined | Promise<{ provider?: string; model?: string } | undefined>
    saveSelection(selection: { provider: string; model: string }): void | Promise<void>
  }
  commands?: {
    register(definition: unknown): unknown
  }
  get?<T = unknown>(name: string): T | undefined
  plugin(plugin: unknown, config: unknown): unknown
  pluginManager?: {
    installBundle(spec: string): Promise<{ application?: string, error?: { diagnostic?: string } }>
    removeBundle(name: string): Promise<{ application?: string }>
  }
  inject?(services: string[], callback: (ctx: HostContext) => unknown): unknown
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

export interface ClientContext {
  remote: {
    credentials: ClientCredentials
    settings?: SettingsController
    $on?(event: string, listener: (...args: unknown[]) => unknown): unknown
  }
  settingsController?: SettingsController
  /** Resolve an optional client service without making it a hard injection. */
  get?<T = unknown>(name: string): T | undefined
  /** rc.2 client slot registry; a settings page registers `settings.section`. */
  slots?: {
    register(options: { name: string; [key: string]: unknown }, component: unknown): unknown
    inject?(name: string, register: () => unknown): unknown
  }
  layout?: {
    selectPanel(panelId: string): void
  }
  /** rc.3 right sidebar navigation controller. */
  sidebarRight?: {
    openResource?(address: string, options?: { params?: Record<string, unknown> }): void
  }
  /** rc.3 right sidebar tab-type registry. */
  sidebarRightTabs?: {
    register(definition: Record<string, unknown>): unknown
  }
  /** Legacy scaffold slot used when the host has no `slots` registry. */
  settings?: {
    section?: Slot
  }
  conversation?: {
    chat?: {
      turnTail?: Slot
    }
  }
  sidebar?: {
    right?: {
      pane?: {
        tab?: Slot
        open?(kind: string, data?: unknown): void | Promise<void>
      }
    }
  }
  userQuestions?: {
    request?: Slot
  }
  uiConversation?: {
    events?: {
      register?(definition: unknown): unknown
    }
  }
  on?(event: string, listener: (...args: any[]) => unknown): unknown
}

export function isDisposable(value: unknown): value is Disposable {
  return typeof value === 'object' && value !== null && 'dispose' in value
    && typeof (value as { dispose?: unknown }).dispose === 'function'
}

export async function registerAdapter(ctx: HostContext, adapter: DshLlmAdapter): Promise<AdapterRegistration> {
  const handle = ctx.llm.registerAdapter(['eais'], adapter)
  if (typeof handle !== 'function' || typeof handle.replace !== 'function') {
    throw new EaisError('E_ADAPTER_LIFECYCLE', 'DSH 模型适配注册句柄不符合 0.2.1-rc.2 契约')
  }
  return {
    dispose: () => handle(),
    replaceProviders: (providers) => handle.replace(providers),
  }
}

export async function readSettings(controller: SettingsController | undefined): Promise<EaisSettings> {
  if (!controller) throw new EaisError('E_SETTINGS_UNAVAILABLE', 'DSH 设置读取接口不可用')
  let value: unknown
  if (typeof controller.describe === 'function') {
    const described = unwrapRemoteResult(await controller.describe()) as SettingsDescribeValue
    const namespace = described.namespaces.find((candidate) => candidate.ns === EAIS_SETTINGS_KEY)
    value = namespace?.value
  } else if (typeof controller.get === 'function') {
    value = unwrapRemoteResult(await controller.get<unknown>(EAIS_SETTINGS_KEY))
  } else {
    throw new EaisError('E_SETTINGS_UNAVAILABLE', 'DSH 设置读取接口不可用')
  }
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EaisError('E_SETTINGS_INVALID', 'DSH 中的 EAIS 设置格式无效')
  }
  return value as EaisSettings
}

export async function writeSettings(
  controller: SettingsController | undefined,
  value: EaisSettings,
): Promise<void> {
  if (!controller || typeof controller.update !== 'function') {
    throw new EaisError('E_SETTINGS_UNAVAILABLE', 'DSH 设置写入接口不可用')
  }
  const current = await readSettings(controller).catch(() => ({}))
  unwrapRemoteResult(await controller.update(EAIS_SETTINGS_KEY, { ...current, ...value }, undefined))
}

export async function writeSettingsWithRetry(
  controller: SettingsController | undefined,
  value: EaisSettings,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await writeSettings(controller, value)
      return
    } catch (error) {
      const nested = error instanceof Error && error.message.includes('HMR transactions cannot be nested')
      if (!nested || attempt >= 4) throw error
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)))
    }
  }
}
