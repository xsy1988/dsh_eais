import { useState } from 'react'
import type { ClientContext } from '../port.js'
import type { TurnCardEntry } from './cards/select.js'

interface PreviewPayload {
  eais: 'plugin-preview/v1'
  previewPath?: string
  candidatePackageName: string
  panelId: string
  displayName: string
  access?: Array<{ name?: string, code?: string, fields?: string[] }>
}

interface SubmitPayload {
  eais: 'plugin-submit/v1'
  plugin: { pluginNo: string, displayName: string, panelId: string, currentVersion: string }
}

type PluginCard =
  | { kind: 'preview', payload: PreviewPayload }
  | { kind: 'completed', payload: SubmitPayload }
  | { kind: 'error', message: string, pluginNo?: string }

export function selectPluginCard(entries: TurnCardEntry[]): PluginCard | undefined {
  for (const entry of entries) {
    const parsed = parseObject(entry.text)
    if (parsed?.eais === 'plugin-preview/v1') return { kind: 'preview', payload: parsed as unknown as PreviewPayload }
  }
  const submit = entries.map(entry => parseObject(entry.text)).find(value => value?.eais === 'plugin-submit/v1') as unknown as SubmitPayload | undefined
  const installed = entries.some(entry => entry.toolName.includes('plugin_manager') && /applied/.test(entry.text) && !/restart-required|"isError"\s*:\s*true/.test(entry.text))
  if (submit && installed) return { kind: 'completed', payload: submit }
  for (const entry of entries) {
    if (!entry.toolName.includes('plugin_')) continue
    const parsed = parseObject(entry.text)
    const error = parsed?.error as { code?: string, message?: string } | undefined
    if (error) return { kind: 'error', message: friendlyPluginError(error.code, error.message), pluginNo: parsed?.pluginNo as string | undefined }
  }
  return undefined
}

export function friendlyPluginError(code = '', message = ''): string {
  if (code === 'E_SCOPE_DENIED') return '这个插件需要的数据权限目前不可用'
  if (code === 'E_LIMIT_EXCEEDED' || code === 'E_DELIVERY_DIGEST') return '这次能取到的数据不够展示，请缩小范围或联系管理员调整数据策略'
  if (code === 'E_CONTENT_LOCK') return '插件内容在签名后发生了变化，需要重新提交新版本'
  if (/already|版本已存在|同一版本/.test(message)) return '这个版本已经存在，请换一个版本再提交'
  if (/network|fetch failed|failed to fetch|load failed/i.test(message)) return '暂时连不上服务，请检查网络后重试'
  return '这个插件暂时打不开，我可以带上诊断信息继续检查'
}

export function PluginTurnCard({ card, ctx, props, openResource, fetchImpl = fetch }: {
  card: PluginCard
  ctx: ClientContext
  props?: unknown
  openResource?: (address: string) => void
  fetchImpl?: typeof fetch
}) {
  const [busy, setBusy] = useState(false)
  const record = (props ?? {}) as { useSession?: (selector: (session: { sessionId?: unknown }) => unknown) => unknown }
  const sessionID = String(record.useSession?.((session) => session.sessionId) ?? '')
  const send = async (text: string) => {
    if (!sessionID) return
    setBusy(true)
    try {
      const response = await fetchImpl('/eais/forge/control', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sessionId: sessionID, action: 'prompt', text }),
      })
      if (!response.ok) throw new Error('暂时无法回到创作会话，请稍后重试')
    } finally {
      setBusy(false)
    }
  }
  const baseStyle = { border: '0.5px solid var(--dsw-alias-border-l2, #ddd)', borderRadius: 10, padding: 14, display: 'grid', gap: 8 }
  if (card.kind === 'error') return <section style={baseStyle} role="alert">
    <strong>{card.message}</strong>
    <button type="button" disabled={busy} onClick={() => void send(`帮我看看插件${card.pluginNo ? ` ${card.pluginNo}` : ''}：${card.message}`)}>帮我看看</button>
  </section>
  if (card.kind === 'completed') {
    const plugin = card.payload.plugin
    return <section style={baseStyle} role="status">
      <strong>装好了：{plugin.displayName}</strong>
      <span>在「我的插件」或左侧入口打开。创作模式已结束，临时工具已收回。</span>
      <button type="button" onClick={() => ctx.layout?.selectPanel(plugin.panelId)}>打开插件</button>
    </section>
  }
  const preview = card.payload
  const open = () => {
    if (!preview.previewPath || !preview.previewPath.startsWith('/') || !sessionID || !openResource) return
    openResource(`dsh-resource://file/session/${encodeURIComponent(sessionID)}/${preview.previewPath.split('/').map(encodeURIComponent).join('/')}`)
  }
  return <section style={baseStyle}>
    <strong>{preview.displayName} · 可点击预览</strong>
    <span>数据是假的，样子是真的。正式名称：{preview.candidatePackageName}</span>
    <span>会读取：{preview.access?.map(item => item.name || item.code).join('、') || '已声明的数据'}；不会修改任何数据。</span>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={open}>打开预览</button>
      <button type="button" disabled={busy} onClick={() => void send(`我确认预览和名称「${preview.displayName}」，正式名 ${preview.candidatePackageName}。请用 finalize.mjs 改写正式名和面板编号 ${preview.panelId}，重新 verify 后调用 plugin_submit。`)}>就这样装</button>
      <button type="button" disabled={busy} onClick={() => void send('我还想修改这个插件预览，请先问我需要调整什么。')}>再改改</button>
    </div>
  </section>
}

function parseObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{')
  if (start < 0) return undefined
  for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
    try {
      const value = JSON.parse(text.slice(start, end + 1))
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
    } catch {}
  }
  return undefined
}
