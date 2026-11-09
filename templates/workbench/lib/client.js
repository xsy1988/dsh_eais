window.__ModuleLoader__.load({
  id: "__PACKAGE__",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
const { Component, createElement: h, useCallback, useEffect, useRef, useState } = require('react')

const inject = ['slots']
const PANEL = '__PANEL__'
const ACTION = '__ACTION__'
const LABEL = '__LABEL__'

const CSS = `
.__PANEL__ { box-sizing:border-box; height:100%; min-height:0; overflow:auto; padding:24px 24px 36px; color:var(--dsw-alias-label-primary,#1a1a1a); background:var(--dsw-alias-bg-base,#fff); font-family:var(--dsw-font-family,sans-serif); font-size:13px; line-height:20px; -webkit-font-smoothing:antialiased; }
.__PANEL__ * { box-sizing:border-box; }
.__PANEL__-inner { display:grid; width:100%; max-width:960px; margin:0 auto; gap:16px; }
.__PANEL__-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.__PANEL__-title { margin:0; font-size:16px; line-height:24px; font-weight:500; }
.__PANEL__-subtitle { margin:3px 0 0; color:var(--dsw-alias-label-secondary,#555); font-size:12px; line-height:18px; }
.__PANEL__-button { appearance:none; height:28px; padding:0 12px; border:0.5px solid var(--dsw-alias-border-l2,#d9d9d9); border-radius:var(--dsw-radius-sm,8px); background:var(--dsw-alias-bg-layer-1,#fff); color:var(--dsw-alias-label-primary,#1a1a1a); font-family:inherit; font-size:12px; cursor:pointer; }
.__PANEL__-button:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-2,#f5f5f5); }
.__PANEL__-button:disabled { opacity:.55; cursor:default; }
.__PANEL__-button:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary,#4f7df3); outline-offset:2px; }
.__PANEL__-card { min-width:0; padding:14px 16px 16px; border:0.5px solid var(--dsw-alias-border-l1,#e8e8e8); border-radius:var(--dsw-radius-md,12px); background:var(--dsw-alias-bg-layer-1,#fff); }
.__PANEL__-card-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; font-size:13px; font-weight:500; }
.__PANEL__-muted { color:var(--dsw-alias-label-tertiary,#8a8a8a); font-size:11px; line-height:16px; font-weight:400; }
.__PANEL__-notice { padding:10px 12px; border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#c00) 35%,transparent); border-radius:var(--dsw-radius-sm,8px); background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c00) 6%,transparent); color:var(--dsw-alias-state-error-primary,#c00); font-size:12px; line-height:18px; white-space:pre-wrap; overflow-wrap:anywhere; }
.__PANEL__-status { padding:32px 12px; text-align:center; color:var(--dsw-alias-label-tertiary,#8a8a8a); font-size:12px; }
.__PANEL__-fields { margin:0; }
.__PANEL__-field { display:grid; grid-template-columns:minmax(100px,28%) minmax(0,1fr); gap:16px; padding:10px 0; border-bottom:0.5px solid var(--dsw-alias-border-l1,#e8e8e8); }
.__PANEL__-field:last-child { border-bottom:0; }
.__PANEL__-field dt { color:var(--dsw-alias-label-tertiary,#8a8a8a); font-size:12px; overflow-wrap:anywhere; }
.__PANEL__-field dd { margin:0; min-width:0; color:var(--dsw-alias-label-primary,#1a1a1a); font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; }
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

function WorkbenchPanel({ ctx }) {
  const dataRef = useRef(null)
  if (dataRef.current === null) dataRef.current = ctx.eaisData || false
  const sequence = useRef(0)
  const [state, setState] = useState({ loading: true, columns: [], record: undefined, error: '', updatedAt: '' })
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
      const record = rows[0]
      const columns = Array.isArray(result.columns) && result.columns.length > 0 ? result.columns : Object.keys(record ?? {}).map((key) => ({ key, label: key }))
      setState({ loading: false, columns, record, error: '', updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }) })
    } catch (error) {
      if (current !== sequence.current) return
      setState((old) => ({ ...old, loading: false, error: describeError(error) }))
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return h('section', { className: PANEL }, h('div', { className: `${PANEL}-inner` },
    h('header', { className: `${PANEL}-header` },
      h('div', null, h('h2', { className: `${PANEL}-title` }, LABEL), h('p', { className: `${PANEL}-subtitle` }, `企业数据${state.updatedAt ? ` · 更新于 ${state.updatedAt}` : ''}`)),
      h('button', { className: `${PANEL}-button`, type: 'button', disabled: state.loading, onClick: () => void refresh() }, state.loading ? '读取中…' : '刷新')),
    state.error ? h('div', { className: `${PANEL}-notice`, role: 'alert' }, state.error) : null,
    h('section', { className: `${PANEL}-card` },
      h('div', { className: `${PANEL}-card-head` }, h('span', null, '记录详情'), h('span', { className: `${PANEL}-muted` }, state.record ? `${state.columns.length} 个字段` : '')),
      state.loading && !state.record ? h('div', { className: `${PANEL}-status` }, '正在读取…')
        : !state.loading && !state.record && !state.error ? h('div', { className: `${PANEL}-status` }, '没有找到记录')
          : state.record ? h('dl', { className: `${PANEL}-fields` }, state.columns.map((column) => h('div', { className: `${PANEL}-field`, key: column.key },
            h('dt', null, column.label || column.key), h('dd', null, text(state.record[column.key]))))) : null)))
}

function WorkbenchIcon(props) {
  const size = Number(props?.size) || 16
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round', 'aria-hidden': 'true' },
    h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }), h('path', { d: 'M8 4v16M8 9h13' }))
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
    await register({ name: 'sidebar.panellist', id: PANEL, order: 40, label: LABEL }, WorkbenchIcon)
    await register({ name: 'main', key: PANEL }, () => h(PanelBoundary, null, h(WorkbenchPanel, { ctx })))
  } catch (error) { removeStyles(); throw error }
  return async () => { for (const dispose of disposables.reverse()) await dispose(); removeStyles() }
}

exports.inject = inject
exports.apply = apply
    return module.exports;
  }
});
