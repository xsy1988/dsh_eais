window.__ModuleLoader__.load({
  id: "__PACKAGE__",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
const { Component, createElement: h, useCallback, useEffect, useMemo, useRef, useState } = require('react')

const inject = ['slots']
const PANEL = '__PANEL__'
const ACTION = '__ACTION__'
const LABEL = '__LABEL__'

const CSS = `
.__PANEL__ { box-sizing:border-box; height:100%; min-height:0; overflow:auto; padding:24px 24px 36px; color:var(--dsw-alias-label-primary,#1a1a1a); background:var(--dsw-alias-bg-base,#fff); font-family:var(--dsw-font-family,sans-serif); font-size:13px; line-height:20px; -webkit-font-smoothing:antialiased; }
.__PANEL__ * { box-sizing:border-box; }
.__PANEL__-inner { display:grid; width:100%; max-width:1120px; margin:0 auto; gap:16px; }
.__PANEL__-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.__PANEL__-title { margin:0; font-size:16px; line-height:24px; font-weight:500; }
.__PANEL__-subtitle { margin:3px 0 0; color:var(--dsw-alias-label-secondary,#555); font-size:12px; line-height:18px; }
.__PANEL__-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.__PANEL__-input, .__PANEL__-button { height:28px; border:0.5px solid var(--dsw-alias-border-l2,#d9d9d9); border-radius:var(--dsw-radius-sm,8px); background:var(--dsw-alias-bg-layer-1,#fff); color:var(--dsw-alias-label-primary,#1a1a1a); font-family:inherit; font-size:12px; }
.__PANEL__-input { width:min(220px,100%); padding:0 10px; outline:none; }
.__PANEL__-input:focus { border-color:var(--dsw-alias-state-business-primary,#4f7df3); box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#4f7df3) 12%,transparent); }
.__PANEL__-button { padding:0 12px; cursor:pointer; }
.__PANEL__-button:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-2,#f5f5f5); }
.__PANEL__-button:disabled { opacity:.55; cursor:default; }
.__PANEL__ button:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary,#4f7df3); outline-offset:2px; }
.__PANEL__-card { min-width:0; padding:14px 16px 16px; border:0.5px solid var(--dsw-alias-border-l1,#e8e8e8); border-radius:var(--dsw-radius-md,12px); background:var(--dsw-alias-bg-layer-1,#fff); }
.__PANEL__-card-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; font-size:13px; font-weight:500; }
.__PANEL__-muted { color:var(--dsw-alias-label-tertiary,#8a8a8a); font-size:11px; line-height:16px; font-weight:400; }
.__PANEL__-notice { padding:10px 12px; border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#c00) 35%,transparent); border-radius:var(--dsw-radius-sm,8px); background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c00) 6%,transparent); color:var(--dsw-alias-state-error-primary,#c00); font-size:12px; line-height:18px; white-space:pre-wrap; overflow-wrap:anywhere; }
.__PANEL__-status { padding:32px 12px; text-align:center; color:var(--dsw-alias-label-tertiary,#8a8a8a); font-size:12px; }
.__PANEL__-table-scroll { overflow-x:auto; }
.__PANEL__-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12px; line-height:18px; }
.__PANEL__-table th { padding:7px 10px; border-bottom:0.5px solid var(--dsw-alias-border-l2,#d9d9d9); color:var(--dsw-alias-label-tertiary,#8a8a8a); font-weight:500; text-align:left; }
.__PANEL__-table td { max-width:220px; padding:8px 10px; border-bottom:0.5px solid var(--dsw-alias-border-l1,#e8e8e8); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.__PANEL__-table tr:last-child td { border-bottom:0; }
.__PANEL__-table tbody tr:hover { background:var(--dsw-alias-bg-layer-2,#f5f5f5); }
`

function ensureStyles() {
  if (typeof document === 'undefined') return () => {}
  const style = document.createElement('style')
  style.dataset.eaisPanel = PANEL
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

function text(value) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function describeError(error) {
  const code = error && typeof error === 'object' ? error.code : ''
  if (code === 'E_SCOPE_DENIED') return '你没有查这类数据的权限'
  if (code === 'E_CARD_TOKEN' || code === 'E_PLUGIN_IDENTITY') return '员工卡不可用，请重新登录'
  if (code === 'E_DELIVERY_DIGEST') return '这次只返回了数据摘要，请缩小查询范围后重试'
  const message = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : ''
  if (!message || /abort|failed to fetch|fetch failed|network|load failed/i.test(message)) return '连不上，请稍后重试'
  return message
}

class PanelBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error(`[${PANEL}] panel crashed`, error) }
  render() {
    if (!this.state.error) return this.props.children
    return h('section', { className: PANEL }, h('div', { className: `${PANEL}-inner` },
      h('div', { className: `${PANEL}-notice`, role: 'alert' }, `插件渲染失败：${this.state.error.message || String(this.state.error)}`)))
  }
}

function DataTable({ columns, rows }) {
  return h('div', { className: `${PANEL}-table-scroll` }, h('table', { className: `${PANEL}-table` },
    h('thead', null, h('tr', null, columns.map((column) => h('th', { key: column.key, scope: 'col' }, column.label || column.key)))),
    h('tbody', null, rows.map((row, index) => h('tr', { key: row.id ?? index }, columns.map((column) => {
      const value = text(row[column.key])
      return h('td', { key: column.key, title: value }, value)
    }))))))
}

function ListPanel({ ctx }) {
  const dataRef = useRef(null)
  if (dataRef.current === null) dataRef.current = ctx.eaisData || false
  const sequence = useRef(0)
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ loading: true, columns: [], rows: [], error: '', truncated: false, updatedAt: '' })
  const refresh = useCallback(async () => {
    const current = ++sequence.current
    setState((old) => ({ ...old, loading: true, error: '' }))
    const data = dataRef.current
    if (!data) { setState((old) => ({ ...old, loading: false, error: '企业数据服务不可用，请重新打开插件' })); return }
    try {
      const result = await data.call({ code: ACTION, params: {}, detail: 'auto' })
      if (current !== sequence.current) return
      if (result.delivery === 'digest') { const error = new Error('digest'); error.code = 'E_DELIVERY_DIGEST'; throw error }
      const rows = Array.isArray(result.rows) ? result.rows : []
      const columns = Array.isArray(result.columns) && result.columns.length > 0 ? result.columns.slice(0, 6) : Object.keys(rows[0] ?? {}).slice(0, 6).map((key) => ({ key, label: key }))
      setState({ loading: false, columns, rows, error: '', truncated: Boolean(result.truncated), updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }) })
    } catch (error) {
      if (current !== sequence.current) return
      setState((old) => ({ ...old, loading: false, error: describeError(error) }))
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return needle ? state.rows.filter((row) => Object.values(row).some((value) => text(value).toLocaleLowerCase().includes(needle))) : state.rows
  }, [query, state.rows])
  return h('section', { className: PANEL }, h('div', { className: `${PANEL}-inner` },
    h('header', { className: `${PANEL}-header` },
      h('div', null, h('h2', { className: `${PANEL}-title` }, LABEL), h('p', { className: `${PANEL}-subtitle` }, `企业数据${state.updatedAt ? ` · 更新于 ${state.updatedAt}` : ''}`)),
      h('div', { className: `${PANEL}-controls` },
        h('input', { className: `${PANEL}-input`, value: query, onChange: (event) => setQuery(event.target.value), placeholder: '筛选当前结果', 'aria-label': '筛选当前结果' }),
        h('button', { className: `${PANEL}-button`, type: 'button', disabled: state.loading, onClick: () => void refresh() }, state.loading ? '读取中…' : '刷新'))),
    state.error ? h('div', { className: `${PANEL}-notice`, role: 'alert' }, state.error) : null,
    h('section', { className: `${PANEL}-card` },
      h('div', { className: `${PANEL}-card-head` }, h('span', null, '数据列表'), h('span', { className: `${PANEL}-muted` }, state.truncated ? '仅显示部分结果' : `${filtered.length} 条`)),
      state.loading && state.rows.length === 0 ? h('div', { className: `${PANEL}-status` }, '正在读取…')
        : !state.loading && filtered.length === 0 && !state.error ? h('div', { className: `${PANEL}-status` }, state.rows.length > 0 ? '没找到匹配的记录' : '没有数据')
          : filtered.length > 0 ? h(DataTable, { columns: state.columns, rows: filtered }) : null)))
}

function ListIcon(props) {
  const size = Number(props?.size) || 16
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', 'aria-hidden': 'true' },
    h('path', { d: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' }))
}

async function apply(ctx) {
  const slots = ctx.get('slots')
  if (!slots || typeof slots.register !== 'function') return
  const removeStyles = ensureStyles()
  const disposables = []
  const register = async (definition, component) => {
    const run = () => slots.register(definition, component)
    const registration = typeof slots.inject === 'function' ? await slots.inject(definition.name, run) : await run()
    if (typeof registration === 'function') disposables.push(registration)
    else if (registration?.dispose) disposables.push(() => registration.dispose())
  }
  try {
    await register({ name: 'sidebar.panellist', id: PANEL, order: 40, label: LABEL }, ListIcon)
    await register({ name: 'main', key: PANEL }, () => h(PanelBoundary, null, h(ListPanel, { ctx })))
  } catch (error) { removeStyles(); throw error }
  return async () => { for (const dispose of disposables.reverse()) await dispose(); removeStyles() }
}

exports.inject = inject
exports.apply = apply
    return module.exports;
  }
});
