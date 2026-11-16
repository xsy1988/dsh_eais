import { useCallback, useEffect, useState } from 'react'
import type { EmployeePlugin, PluginApi, PluginEvent, PluginArtifactApi } from './api.js'

const STATUS = { trial: '试用中', private: '仅自己可用', online: '已共享', offline: '已下线' } as const

export function PluginCenter({ api, artifacts, openPlugin }: { api: PluginApi, artifacts?: PluginArtifactApi, openPlugin?: (plugin: EmployeePlugin) => void }) {
  const [tab, setTab] = useState<'installed' | 'diagnostics'>('installed')
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
      let displayName = ''
      if (action === 'rollback') version = window.prompt('输入要恢复的已签名版本号') ?? ''
      if (action === 'renew' && plugin.renewalCount === 1) reason = window.prompt('请填写第二次续期理由') ?? ''
      if (action === 'display-name') displayName = window.prompt('插件显示名', plugin.displayName) ?? ''
      const successor = action === 'publish' ? window.prompt('接手人工号（作者无法继续维护时使用）', plugin.successorStaffNo ?? '') ?? '' : ''
      if (action === 'open') openPlugin?.(plugin)
      if ((action === 'rollback' && !version) || (action === 'renew' && plugin.renewalCount === 1 && !reason) || (action === 'display-name' && !displayName) || (action === 'publish' && !successor)) return
      if (action === 'publish' && artifacts) await artifacts.publish(plugin.pluginNo, successor)
      else if (action === 'install' && artifacts) await artifacts.install(plugin.pluginNo, plugin.currentVersion)
      else await api.action(plugin.pluginNo, action, version, reason, displayName)
      await refresh()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }

  return <section style={{ padding: 24, display: 'grid', gap: 16, height: '100%', minHeight: 0, overflow: 'auto' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
      <div><h2 style={{ margin: 0 }}>我的插件</h2><p style={{ margin: '4px 0', opacity: .7 }}>打开、修改或分享你创建的插件。</p></div>
      <button type="button" onClick={() => void refresh()}>刷新</button>
    </header>
    <nav style={{ display: 'flex', gap: 8 }} aria-label="插件视图">
      <button type="button" onClick={() => setTab('installed')}>插件清单</button>
      <button type="button" onClick={() => setTab('diagnostics')}>诊断</button>
    </nav>
    {error ? <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary, #c00)' }}>{error}</p> : null}
    {loading ? <p>正在读取…</p> : null}
    {!loading && items.length === 0 ? <p>还没有自建插件。输入 /forge（插件创作）开始制作。</p> : null}
    {tab !== 'diagnostics' ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
      {items.map((plugin) => <article key={plugin.pluginNo} style={{ border: '1px solid var(--dsw-alias-border-primary, #ddd)', borderRadius: 12, padding: 16, display: 'grid', gap: 8 }}>
        <strong>{plugin.displayName || plugin.packageName}</strong>
        <span>作者 {plugin.authorStaffNo || plugin.ownerStaffNo} · {STATUS[plugin.status]}</span>
        <span>谁能用：{plugin.status === 'online' ? '已按审批范围共享' : '仅自己'}</span>
        <span>版本 {plugin.currentVersion} · 上次打开 {plugin.lastOpenedAt ? new Date(plugin.lastOpenedAt).toLocaleString() : '尚未打开'}</span>
        {plugin.status === 'trial' ? <span>试用至 {new Date(plugin.trialExpiresAt).toLocaleDateString()} · 私有位 {plugin.privateUsed}/{plugin.privateLimit}</span> : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {plugin.status !== 'offline' && (plugin.relation !== 'shared' || plugin.installed) ? <button type="button" onClick={() => void act(plugin, 'open')}>打开</button> : null}
          {plugin.relation === 'shared' && !plugin.installed ? <button type="button" onClick={() => void act(plugin, 'install')}>安装</button> : null}
          {plugin.relation !== 'shared' && plugin.status === 'trial' ? <button type="button" onClick={() => void act(plugin, 'renew')}>续期</button> : null}
          {plugin.relation !== 'shared' && plugin.status === 'trial' ? <button type="button" onClick={() => void act(plugin, 'retain-private')}>保留给自己</button> : null}
          {plugin.relation !== 'shared' && (plugin.status === 'trial' || plugin.status === 'private') ? <button type="button" onClick={() => void act(plugin, 'publish')}>给同事用</button> : null}
          {plugin.relation !== 'shared' && plugin.status !== 'offline' ? <button type="button" onClick={() => void act(plugin, 'display-name')}>改显示名</button> : null}
          {plugin.relation !== 'shared' && plugin.status !== 'offline' ? <button type="button" onClick={() => void act(plugin, 'rollback')}>回滚</button> : null}
          {plugin.relation !== 'shared' && plugin.status !== 'offline' ? <button type="button" onClick={() => void act(plugin, 'offline')}>下线</button> : null}
          {plugin.relation !== 'shared' ? <button type="button" onClick={() => { setSelected(plugin.pluginNo); setTab('diagnostics') }}>诊断</button> : null}
        </div>
      </article>)}
    </div> : <div style={{ display: 'grid', gap: 8 }}>
      <select aria-label="选择插件" value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">选择插件</option>{items.map((plugin) => <option key={plugin.pluginNo} value={plugin.pluginNo}>{plugin.displayName || plugin.packageName}</option>)}
      </select>
      {events.length === 0 ? <p>选择插件后查看诊断事件。</p> : events.map((event) => <article key={event.eventId}>
        <strong>{event.event}</strong><div>{new Date(event.createdAt).toLocaleString()} · {event.actor}</div>
        <code>{JSON.stringify(event.detail)}</code>
      </article>)}
    </div>}
  </section>
}
