import { useCallback, useEffect, useState } from 'react'
import type { EmployeePlugin, PluginApi, PluginEvent } from './api.js'

const STATUS = { trial: '试制中', private: '私有常驻', online: '已上线', offline: '已下线' } as const

export function PluginCenter({ api }: { api: PluginApi }) {
  const [tab, setTab] = useState<'installed' | 'diagnostics' | 'trial'>('installed')
  const [items, setItems] = useState<EmployeePlugin[]>([])
  const [events, setEvents] = useState<PluginEvent[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setItems(await api.list()) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setLoading(false) }
  }, [api])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!selected) { setEvents([]); return }
    void api.events(selected).then(setEvents).catch((failure: Error) => setError(failure.message))
  }, [api, selected])

  const act = async (plugin: EmployeePlugin, action: string) => {
    setError('')
    try {
      let version = ''
      let reason = ''
      if (action === 'rollback') version = window.prompt('输入要恢复的已签名版本号') ?? ''
      if (action === 'renew' && plugin.renewalCount === 1) reason = window.prompt('请填写第二次续期理由') ?? ''
      if ((action === 'rollback' && !version) || (action === 'renew' && plugin.renewalCount === 1 && !reason)) return
      await api.action(plugin.pluginNo, action, version, reason)
      await refresh()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }

  return <section style={{ padding: 16, display: 'grid', gap: 12 }}>
    <header><h2 style={{ margin: 0 }}>我的插件</h2><p style={{ margin: '4px 0', opacity: .7 }}>管理自己创建的插件、诊断和试制状态。</p></header>
    <nav style={{ display: 'flex', gap: 8 }} aria-label="插件视图">
      <button type="button" onClick={() => setTab('installed')}>已装清单</button>
      <button type="button" onClick={() => setTab('diagnostics')}>插件诊断</button>
      <button type="button" onClick={() => setTab('trial')}>试制状态</button>
      <button type="button" onClick={() => void refresh()}>刷新</button>
    </nav>
    {error ? <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary, #c00)' }}>{error}</p> : null}
    {loading ? <p>正在读取…</p> : null}
    {!loading && items.length === 0 ? <p>还没有自建插件。输入 /插件创作 开始制作。</p> : null}
    {tab !== 'diagnostics' ? <div style={{ display: 'grid', gap: 8 }}>
      {items.map((plugin) => <article key={plugin.pluginNo} style={{ border: '1px solid var(--dsw-alias-border-primary, #ddd)', borderRadius: 8, padding: 12 }}>
        <strong>{plugin.packageName}</strong><div>{plugin.pluginNo} · {STATUS[plugin.status]} · {plugin.currentVersion}</div>
        {tab === 'trial' ? <div>到期：{new Date(plugin.trialExpiresAt).toLocaleDateString()} · 私有位 {plugin.privateUsed}/{plugin.privateLimit} · 续期 {plugin.renewalCount}/2</div> : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {plugin.status !== 'offline' ? <button type="button" onClick={() => void act(plugin, 'open')}>打开</button> : null}
          {plugin.status === 'trial' ? <button type="button" onClick={() => void act(plugin, 'renew')}>续期</button> : null}
          {plugin.status === 'trial' ? <button type="button" onClick={() => void act(plugin, 'retain-private')}>私有常驻</button> : null}
          {plugin.status === 'trial' || plugin.status === 'private' ? <button type="button" onClick={() => void act(plugin, 'publish')}>申请上线</button> : null}
          {plugin.status !== 'offline' ? <button type="button" onClick={() => void act(plugin, 'rollback')}>回滚</button> : null}
          {plugin.status !== 'offline' ? <button type="button" onClick={() => void act(plugin, 'offline')}>下线</button> : null}
          <button type="button" onClick={() => { setSelected(plugin.pluginNo); setTab('diagnostics') }}>诊断</button>
        </div>
      </article>)}
    </div> : <div style={{ display: 'grid', gap: 8 }}>
      <select aria-label="选择插件" value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">选择插件</option>{items.map((plugin) => <option key={plugin.pluginNo} value={plugin.pluginNo}>{plugin.packageName}</option>)}
      </select>
      {events.length === 0 ? <p>选择插件后查看诊断事件。</p> : events.map((event) => <article key={event.eventId}>
        <strong>{event.event}</strong><div>{new Date(event.createdAt).toLocaleString()} · {event.actor}</div>
        <code>{JSON.stringify(event.detail)}</code>
      </article>)}
    </div>}
  </section>
}
