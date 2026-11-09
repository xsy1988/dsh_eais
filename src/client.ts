import { createElement } from 'react'
import type { FetchLike } from './api.js'
import {
  EAIS_TOKEN_REF,
  EaisError,
  failure,
  initialPublicState,
  type EaisConfig,
  type EaisFailure,
  type UiCapability,
} from './contracts.js'
import {
  isDisposable,
  readSettings,
  resolveVolatile,
  settingsControllerOf,
  writeSettings,
  type ClientContext,
  type Disposable,
  type Slot,
} from './port.js'
import { Settings } from './client/Settings.js'
import { CardApi } from './client/cards/api.js'
import { registerEaisData } from './client/data.js'
import { EaisPane, EaisPaneTitle } from './client/cards/EaisPane.js'
import { EaisTurnCards } from './client/cards/EaisTurnCards.js'
import { parseAddress } from './client/cards/parse.js'
import { PluginApi } from './client/plugins/api.js'
import { PluginCenter } from './client/plugins/PluginCenter.js'

export interface ClientOptions extends EaisConfig {
  pluginForge?: boolean
  fetchImpl?: FetchLike
  onLogout?: () => Promise<void>
}

export interface ClientRegistration extends Disposable {
  failures: Partial<Record<UiCapability | 'settings', EaisFailure>>
}

export const inject = ['slots', 'remote', 'remote.credentials', 'remote.settings', 'sidebarRight', 'sidebarRightTabs']

/**
 * L0 registers the login/settings surface only. Cards, panels, and buttons
 * belong to later phases and are deliberately not mounted here.
 */
export async function registerClient(ctx: ClientContext, options: ClientOptions = {}): Promise<ClientRegistration> {
  const resolvedOptions: ClientOptions = {
    ...options,
    serverUrl: resolveVolatile(options.serverUrl),
    serverUrlReadOnly: resolveVolatile(options.serverUrlReadOnly),
  }
  const render = () => createElement(Settings, {
    ctx,
    config: resolvedOptions,
    fetchImpl: options.fetchImpl,
    onLogout: options.onLogout,
  })

  const disposables: Disposable[] = []
  const failures: ClientRegistration['failures'] = {}
  await registerExecutionUI(ctx, resolvedOptions, disposables, failures)
  try {
    let registration: unknown
    if (ctx.slots?.inject) {
      registration = await ctx.slots.inject('settings.section', () => ctx.slots!.register({
        name: 'settings.section',
        id: 'eais',
        order: 50,
        label: '企业模式',
      }, render))
    } else if (ctx.slots?.register) {
      registration = await ctx.slots.register({
        name: 'settings.section',
        id: 'eais',
        order: 50,
        label: '企业模式',
      }, render)
    } else {
      const slot: Slot | undefined = ctx.settings?.section
      if (!slot) throw new EaisError('E_UI_SLOT_UNAVAILABLE', 'settings 槽位不可用')
      registration = await slot.register({ id: 'eais', title: '企业模式', render })
    }
    disposables.push(registrationDisposable(registration))
  } catch (error) {
    failures.settings = failure(error, 'E_UI_REGISTER')
  }

  if (resolvedOptions.pluginForge === true && ctx.slots?.register) {
    try {
      const pluginApi = new PluginApi({
        serverUrl: (resolvedOptions.serverUrl ?? 'http://127.0.0.1:18080').replace(/\/$/, ''),
        fetchImpl: resolvedOptions.fetchImpl,
        resolveToken: async () => {
          const resolved = await ctx.remote.credentials.resolve?.(EAIS_TOKEN_REF)
          return typeof resolved === 'string' ? resolved : resolved?.value
        },
      })
      const register = () => ctx.slots!.register({ name: 'settings.section', id: 'eais-plugins', order: 60, label: '我的插件' },
        () => createElement(PluginCenter, { api: pluginApi }))
      const registration = await (ctx.slots.inject ? ctx.slots.inject('settings.section', register) : register())
      disposables.push(registrationDisposable(registration))
    } catch (error) {
      failures.settings = failure(error, 'E_UI_REGISTER')
    }
  }

  let settings: Awaited<ReturnType<typeof readSettings>> = {}
  try {
    settings = await readSettings(settingsControllerOf(ctx))
  } catch (error) {
    failures.settings = failure(error, 'E_SETTINGS_UNAVAILABLE')
  }
  const state = settings.state ?? initialPublicState()
  await writeSettings(settingsControllerOf(ctx), {
    serverUrl: settings.serverUrl ?? resolvedOptions.serverUrl,
    state,
  }).catch(() => undefined)
  return {
    failures,
    dispose: async () => {
      for (const disposable of [...disposables].reverse()) await disposable.dispose()
    },
  }
}

// registerExecutionUI wires the rc.3 chat cards and right-sidebar pane. When
// the host does not expose those slots, each registration fails independently
// and the card falls back to the one-time ViewHost page.
async function registerExecutionUI(
  ctx: ClientContext,
  options: ClientOptions,
  disposables: Disposable[],
  failures: ClientRegistration['failures'],
): Promise<void> {
  const serverUrl = (options.serverUrl ?? 'http://127.0.0.1:18080').replace(/\/$/, '')
  const resolveToken = async () => {
    const resolved = await ctx.remote.credentials.resolve?.(EAIS_TOKEN_REF)
    return typeof resolved === 'string' ? resolved : resolved?.value
  }
  registerEaisData(ctx, { fetchImpl: options.fetchImpl })
  const api = new CardApi({ serverUrl, fetchImpl: options.fetchImpl, resolveToken })
  const openResource = async (address: string, openOptions?: { params?: Record<string, unknown> }): Promise<void> => {
    const service = ctx.sidebarRight
    if (service?.openResource) {
      service.openResource(address, openOptions)
      return
    }
    const parsed = parseAddress(address)
    if (!parsed) throw new EaisError('E_VIEW_OPEN', '无法识别卡片地址')
    const token = parsed.kind === 'dataset' ? await api.viewToken(parsed.id) : await api.confirmToken(parsed.id)
    window.open(token.url, '_blank', 'noopener,noreferrer')
  }
  const slots = ctx.slots
  if (!slots?.register) {
    failures.card = failure(new EaisError('E_UI_SLOT_UNAVAILABLE', '卡片槽位不可用'), 'E_UI_REGISTER')
    return
  }
  const registerSlot = async (name: string, definition: { name: string; [key: string]: unknown }, component: unknown): Promise<unknown> => {
    const register = () => slots.register(definition, component)
    return slots.inject ? slots.inject(name, register) : register()
  }
  try {
    const turnCards = await registerSlot(
      'conversation.chat.turnTail',
      { name: 'conversation.chat.turnTail', id: 'eais-cards', order: 10 },
      (props: unknown) => {
        const record = (props ?? {}) as Record<string, unknown>
        return createElement(EaisTurnCards as never, {
          props: record, api, openResource, useChat: record.useChat,
        })
      },
    )
    disposables.push(registrationDisposable(turnCards))
    failures.card = undefined
  } catch (error) {
    failures.card = failure(error, 'E_UI_REGISTER')
  }

  try {
    const tabs = ctx.sidebarRightTabs
    if (tabs?.register) {
      disposables.push(registrationDisposable(tabs.register({
        id: '@corp/dsh-eais', kind: 'eais',
        patterns: ['dsh-resource://eais/**'],
        priority: 'extension', multiple: true, keepMounted: true,
        canOpen: (address: string) => parseAddress(address) !== undefined,
        title: (address: string) => parseAddress(address)?.kind === 'confirm' ? '确认' : '企业数据',
      })))
    }
    const body = await registerSlot(
      'sidebar.right.pane.tab',
      { name: 'sidebar.right.pane.tab', key: '@corp/dsh-eais' },
      (props: unknown) => {
        const record = (props ?? {}) as Record<string, unknown>
        return createElement(EaisPane as never, { api, props: record, inputActions: record.inputActions, useTabInfo: record.useTabInfo, useInput: record.useInput })
      },
    )
    disposables.push(registrationDisposable(body))
    const title = await registerSlot(
      'sidebar.right.pane.tab.title',
      { name: 'sidebar.right.pane.tab.title', key: '@corp/dsh-eais' },
      (props: unknown) => createElement(EaisPaneTitle as never, { props, useTabInfo: (props as Record<string, unknown>)?.useTabInfo }),
    )
    disposables.push(registrationDisposable(title))
    failures.panel = undefined
  } catch (error) {
    failures.panel = failure(error, 'E_UI_REGISTER')
  }
}

function registrationDisposable(value: unknown): Disposable {
  if (value === undefined || value === null) return { dispose: () => undefined }
  if (isDisposable(value)) return value
  if (typeof value === 'function') return { dispose: () => value() }
  throw new EaisError('E_UI_LIFECYCLE', '界面槽位返回了未知的释放句柄')
}

export async function apply(ctx: ClientContext, config: ClientOptions = {}): Promise<() => Promise<void>> {
  try {
    const registration = await registerClient(ctx, config)
    return async () => { await registration.dispose() }
  } catch (error) {
    console.error('[eais] client initialization failed', error)
    return async () => undefined
  }
}

export { Card, extractViewIds } from './client/Card.js'
export { Panel } from './client/Panel.js'
export { Buttons } from './client/Buttons.js'
export { Settings } from './client/Settings.js'
