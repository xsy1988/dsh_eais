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

const MONTH_OPTIONS = [
  { value: 3, label: '近 3 个月' },
  { value: 6, label: '近 6 个月' },
  { value: 12, label: '近 12 个月' },
]

const COLOR = {
  bar: 'var(--dsw-alias-state-business-primary, #4f7df3)',
  line: 'var(--dsw-alias-state-business-primary, #4f7df3)',
  grid: 'var(--dsw-alias-border-l1, #e8e8e8)',
  axis: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
  surface: 'var(--dsw-alias-bg-layer-1, #ffffff)',
}

const CSS = `
.__PANEL__ {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 24px 24px 36px;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  background: var(--dsw-alias-bg-base, #ffffff);
  font-family: var(--dsw-font-family, sans-serif);
  font-size: 13px;
  line-height: 20px;
  -webkit-font-smoothing: antialiased;
}
.__PANEL__ * { box-sizing: border-box; }
.__PANEL__-inner {
  display: grid;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  gap: 16px;
}
.__PANEL__-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.__PANEL__-heading { min-width: 0; }
.__PANEL__-title {
  margin: 0;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
}
.__PANEL__-subtitle {
  margin: 3px 0 0;
  color: var(--dsw-alias-label-secondary, #555555);
  font-size: 12px;
  line-height: 18px;
}
.__PANEL__-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.__PANEL__-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d9d9d9);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.__PANEL__-seg button {
  appearance: none;
  border: 0;
  border-radius: calc(var(--dsw-radius-sm, 8px) - 2px);
  padding: 4px 10px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #555555);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.__PANEL__-seg button:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, #1a1a1a);
  background: var(--dsw-alias-bg-layer-2, #f5f5f5);
}
.__PANEL__-seg button[aria-pressed="true"] {
  color: var(--dsw-alias-label-primary, #1a1a1a);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4f7df3) 10%, var(--dsw-alias-bg-layer-1, #ffffff));
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l1, #e8e8e8);
}
.__PANEL__-seg button:disabled { opacity: 0.55; cursor: default; }
.__PANEL__-button {
  appearance: none;
  height: 28px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d9d9d9);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-family: inherit;
  font-size: 12px;
  line-height: 26px;
  white-space: nowrap;
  cursor: pointer;
}
.__PANEL__-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2, #f5f5f5); }
.__PANEL__-button:disabled { opacity: 0.55; cursor: default; }
.__PANEL__ button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4f7df3);
  outline-offset: 2px;
}
.__PANEL__-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}
.__PANEL__-metric {
  min-width: 0;
  padding: 12px 14px;
  border: 0.5px solid var(--dsw-alias-border-l1, #e8e8e8);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.__PANEL__-metric-label {
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-size: 11px;
  line-height: 16px;
}
.__PANEL__-metric-value {
  margin-top: 3px;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 15px;
  line-height: 22px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.__PANEL__-card {
  min-width: 0;
  padding: 14px 16px 16px;
  border: 0.5px solid var(--dsw-alias-border-l1, #e8e8e8);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.__PANEL__-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.__PANEL__-card-title {
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
}
.__PANEL__-muted {
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-size: 11px;
  line-height: 16px;
}
.__PANEL__-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--dsw-alias-label-secondary, #555555);
  font-size: 11px;
  line-height: 16px;
}
.__PANEL__-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 2px;
  vertical-align: 1px;
}
.__PANEL__-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  margin-right: 6px;
  border-radius: 1px;
  vertical-align: 3px;
}
.__PANEL__-chart-scroll { overflow-x: auto; }
.__PANEL__-chart {
  display: block;
  width: 100%;
  max-width: 860px;
  min-width: 640px;
  height: auto;
  margin: 0 auto;
}
.__PANEL__-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 0.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #c00) 35%, transparent);
  border-radius: var(--dsw-radius-sm, 8px);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c00) 6%, transparent);
  color: var(--dsw-alias-state-error-primary, #c00);
  font-size: 12px;
  line-height: 18px;
}
.__PANEL__-empty,
.__PANEL__-loading {
  padding: 28px 12px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-size: 12px;
  line-height: 18px;
}
.__PANEL__-table-scroll { overflow-x: auto; }
.__PANEL__-table {
  width: 100%;
  border-collapse: collapse;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 12px;
  line-height: 18px;
}
.__PANEL__-table th {
  padding: 7px 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2, #d9d9d9);
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}
.__PANEL__-table td {
  padding: 8px 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, #e8e8e8);
  white-space: nowrap;
}
.__PANEL__-table tr:last-child td { border-bottom: 0; }
.__PANEL__-table tbody tr:hover { background: var(--dsw-alias-bg-layer-2, #f5f5f5); }
.__PANEL__-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.__PANEL__-error {
  margin: 0;
  white-space: pre-wrap;
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 11px;
  line-height: 17px;
}
`

function ensureStyles() {
  if (typeof document === 'undefined') return () => {}
  const style = document.createElement('style')
  style.dataset.eaisSalesTrend = 'true'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function rangeOf(months) {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  return { date_from: ymd(from), date_to: ymd(now) }
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value === null || value === undefined) return 0
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value) {
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)}万`
  return value.toFixed(0)
}

function count(value) {
  return Math.round(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function detail(value) {
  return Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function periodText(period, sameYear) {
  const matched = /^(\d{4})-?(\d{1,2})/.exec(String(period ?? ''))
  if (!matched) return String(period ?? '')
  const month = Number(matched[2])
  return sameYear ? `${month}月` : `${matched[1]}年${month}月`
}

function axisText(period, sameYear) {
  const matched = /^(\d{4})-?(\d{1,2})/.exec(String(period ?? ''))
  if (!matched) return String(period ?? '').slice(0, 7)
  return sameYear ? `${Number(matched[2])}月` : `${matched[1].slice(2)}/${matched[2]}`
}

function describeError(error) {
  const code = error && typeof error === 'object' ? error.code : ''
  if (code === 'E_SCOPE_DENIED') return '你没有查这类数据的权限'
  if (code === 'E_CARD_TOKEN' || code === 'E_PLUGIN_IDENTITY') return '员工卡不可用，请重新登录'
  if (code === 'E_LIMIT_EXCEEDED') return '数据量太大，请缩小时间范围'
  const text = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : ''
  if (!text || /abort|failed to fetch|fetch failed|network|load failed/i.test(text)) return '连不上，请稍后重试'
  return text
}

function Metric(label, value) {
  return h('div', { className: '__PANEL__-metric' },
    h('div', { className: '__PANEL__-metric-label' }, label),
    h('div', { className: '__PANEL__-metric-value' }, value))
}

function Table(points, sameYear) {
  const columns = [
    { key: 'period', label: '月份', render: (point) => periodText(point.period, sameYear) },
    { key: 'amount', label: '金额', numeric: true, render: (point) => detail(point.amount) },
    { key: 'qty', label: '数量', numeric: true, render: (point) => count(point.qty) },
    { key: 'orders', label: '单数', numeric: true, render: (point) => count(point.orders) },
    { key: 'customers', label: '客户数', numeric: true, render: (point) => count(point.customers) },
  ]
  return h('div', { className: '__PANEL__-table-scroll' },
    h('table', { className: '__PANEL__-table' },
      h('thead', null, h('tr', null, columns.map((column) => h('th', {
        key: column.key,
        className: column.numeric ? 'num' : undefined,
      }, column.label)))),
      h('tbody', null, points.map((point) => h('tr', { key: point.key },
        columns.map((column) => h('td', {
          key: column.key,
          className: column.numeric ? 'num' : undefined,
        }, column.render(point))))))))
}

function Chart(points, sameYear) {
  const width = 760
  const height = 250
  const margin = { left: 52, right: 48, top: 14, bottom: 30 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const baseline = margin.top + plotHeight
  const maxAmount = Math.max(1, ...points.map((point) => point.amount))
  const maxQty = Math.max(1, ...points.map((point) => point.qty))
  const step = plotWidth / points.length
  const barWidth = Math.max(10, Math.min(40, step * 0.5))

  const grids = [0, 0.5, 1].map((ratio) => {
    const y = baseline - plotHeight * ratio
    return h('g', { key: `grid-${ratio}` },
      h('line', {
        x1: margin.left,
        y1: y,
        x2: margin.left + plotWidth,
        y2: y,
        stroke: COLOR.grid,
        strokeWidth: 1,
        strokeDasharray: ratio === 0 ? undefined : '3 4',
      }),
      h('text', {
        x: margin.left - 8,
        y: y + 3.5,
        textAnchor: 'end',
        fontSize: 10.5,
        fill: COLOR.axis,
      }, money(maxAmount * ratio)),
      h('text', {
        x: margin.left + plotWidth + 8,
        y: y + 3.5,
        textAnchor: 'start',
        fontSize: 10.5,
        fill: COLOR.axis,
      }, count(maxQty * ratio)))
  })

  const bars = points.map((point, index) => {
    const barHeight = (point.amount / maxAmount) * plotHeight
    const x = margin.left + step * index + (step - barWidth) / 2
    return h('g', { key: `bar-${point.key}` },
      h('title', null, `${periodText(point.period, sameYear)}：金额 ${detail(point.amount)}，数量 ${count(point.qty)}，单数 ${count(point.orders)}`),
      h('rect', {
        x,
        y: baseline - barHeight,
        width: barWidth,
        height: Math.max(point.amount > 0 ? 2 : 0, barHeight),
        rx: 3,
        fill: COLOR.bar,
        fillOpacity: 0.55,
      }))
  })

  const linePoints = points.map((point, index) => {
    const x = margin.left + step * index + step / 2
    const y = baseline - (point.qty / maxQty) * plotHeight
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const dots = points.map((point, index) => {
    const x = margin.left + step * index + step / 2
    const y = baseline - (point.qty / maxQty) * plotHeight
    return h('circle', {
      key: `dot-${point.key}`,
      cx: x,
      cy: y,
      r: 2.4,
      fill: COLOR.line,
      stroke: COLOR.surface,
      strokeWidth: 1.5,
    })
  })

  const skip = Math.ceil(points.length / 8)
  const labels = points.map((point, index) => (index % skip !== 0 ? null : h('text', {
    key: `label-${point.key}`,
    x: margin.left + step * index + step / 2,
    y: baseline + 19,
    textAnchor: 'middle',
    fontSize: 10.5,
    fill: COLOR.axis,
  }, axisText(point.period, sameYear))))

  return h('svg', {
    className: '__PANEL__-chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': '月度销售趋势',
  }, grids, bars, h('polyline', {
    points: linePoints,
    fill: 'none',
    stroke: COLOR.line,
    strokeWidth: 1.8,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  }), dots, labels)
}

class PanelBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[__PANEL__] panel crashed', error)
  }

  render() {
    if (this.state.error) {
      const text = this.state.error && (this.state.error.stack || this.state.error.message) || String(this.state.error)
      return h('section', { className: '__PANEL__' },
        h('div', { className: '__PANEL__-inner' },
          h('div', { className: '__PANEL__-notice', role: 'alert' },
            h('div', null,
              h('div', null, '插件渲染失败'),
              h('pre', { className: '__PANEL__-error' }, String(text))))))
    }
    return this.props.children
  }
}

function Panel(props) {
  return TrendPanel(props.ctx)
}

function TrendPanel(ctx) {
  const dataRef = useRef(null)
  if (dataRef.current === null) dataRef.current = ctx.eaisData || false
  const [months, setMonths] = useState(6)
  const [state, setState] = useState({ loading: true, rows: [], error: '', truncated: false, updatedAt: '' })
  const sequence = useRef(0)

  const refresh = useCallback(async (nextMonths) => {
    const data = dataRef.current || undefined
    const current = ++sequence.current
    setState((old) => ({ ...old, loading: true, error: '' }))
    if (!data) {
      setState((old) => ({ ...old, loading: false, error: '企业数据服务不可用，请重新打开插件' }))
      return
    }
    try {
      const result = await data.call({
        code: ACTION,
        params: rangeOf(nextMonths),
        detail: 'auto',
      })
      if (current !== sequence.current) return
      if (result && result.delivery === 'digest') {
        const error = new Error('这次只返回了数据摘要，请缩小时间范围后重试')
        error.code = 'E_DELIVERY_DIGEST'
        throw error
      }
      setState({
        loading: false,
        rows: Array.isArray(result && result.rows) ? result.rows : [],
        error: '',
        truncated: Boolean(result && result.truncated),
        updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      })
    } catch (error) {
      if (current !== sequence.current) return
      setState((old) => ({ ...old, loading: false, error: describeError(error) }))
    }
  }, [])

  useEffect(() => { void refresh(months) }, [refresh, months])

  const points = state.rows.map((row, index) => {
    const period = String(row.period || row.dimension_name || row.dimension_code || '')
    return {
      key: period || `row-${index}`,
      period,
      amount: toNumber(row.amount),
      qty: toNumber(row.qty),
      orders: toNumber(row.order_count),
      customers: toNumber(row.customer_count),
    }
  }).filter((point) => point.period !== '')

  const years = new Set(points.map((point) => point.period.slice(0, 4)))
  const sameYear = years.size <= 1
  const totalAmount = points.reduce((sum, point) => sum + point.amount, 0)
  const totalQty = points.reduce((sum, point) => sum + point.qty, 0)
  const range = rangeOf(months)

  return h('section', { className: '__PANEL__' },
    h('div', { className: '__PANEL__-inner' },
      h('header', { className: '__PANEL__-header' },
        h('div', { className: '__PANEL__-heading' },
          h('h2', { className: '__PANEL__-title' }, LABEL),
          h('p', { className: '__PANEL__-subtitle' },
            `${range.date_from} 至 ${range.date_to}${state.updatedAt ? ` · 更新于 ${state.updatedAt}` : ''}`)),
        h('div', { className: '__PANEL__-controls' },
          h('div', { className: '__PANEL__-seg', role: 'group', 'aria-label': '时间范围' },
            MONTH_OPTIONS.map((option) => h('button', {
              key: option.value,
              type: 'button',
              'aria-pressed': option.value === months,
              disabled: state.loading,
              onClick: () => setMonths(option.value),
            }, option.label))),
          h('button', {
            className: '__PANEL__-button',
            type: 'button',
            disabled: state.loading,
            onClick: () => void refresh(months),
          }, state.loading ? '读取中…' : '刷新'))),
      state.error ? h('div', { className: '__PANEL__-notice', role: 'alert' }, state.error) : null,
      points.length > 0 ? h('div', { className: '__PANEL__-summary' },
        Metric('合计金额', detail(totalAmount)),
        Metric('合计数量', count(totalQty)),
        Metric('覆盖月份', `${points.length} 个月`)) : null,
      h('section', { className: '__PANEL__-card' },
        h('div', { className: '__PANEL__-card-head' },
          h('div', { className: '__PANEL__-card-title' }, '月度趋势'),
          h('div', { className: '__PANEL__-legend' },
            h('span', null,
              h('span', { className: '__PANEL__-dot', style: { background: COLOR.bar, opacity: 0.55 } }),
              '金额（左轴）'),
            h('span', null,
              h('span', { className: '__PANEL__-line', style: { background: COLOR.line } }),
              '数量（右轴）'))),
        state.loading && points.length === 0
          ? h('div', { className: '__PANEL__-loading' }, '正在读取…')
          : (!state.loading && points.length === 0 && !state.error
            ? h('div', { className: '__PANEL__-empty' }, '这段时间没有销售记录，换个范围再试。')
            : (points.length > 0 ? h('div', { className: '__PANEL__-chart-scroll' }, Chart(points, sameYear)) : null))),
      points.length > 0 ? h('section', { className: '__PANEL__-card' },
        h('div', { className: '__PANEL__-card-head' },
          h('div', { className: '__PANEL__-card-title' }, '每月明细'),
          h('span', { className: '__PANEL__-muted' },
            state.truncated ? '数据被截断，仅显示部分月份' : `${points.length} 条`)),
        Table(points, sameYear)) : null))
}

function TrendIcon(props) {
  const size = Number(props && props.size) || 16
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
    h('path', { d: 'M4 19V5' }),
    h('path', { d: 'M4 19h16' }),
    h('path', { d: 'M7 15l4-5 3 2.5 5-7' }))
}

async function apply(ctx) {
  const slots = ctx.get('slots')
  if (!slots || typeof slots.register !== 'function') return
  const removeStyles = ensureStyles()
  const disposables = []
  const register = async (definition, component) => {
    const run = () => slots.register(definition, component)
    const registration = typeof slots.inject === 'function'
      ? await slots.inject(definition.name, run)
      : await run()
    if (typeof registration === 'function') disposables.push(registration)
    else if (registration && typeof registration.dispose === 'function') {
      disposables.push(() => registration.dispose())
    }
  }
  try {
    await register({ name: 'sidebar.panellist', id: PANEL, order: 40, label: LABEL }, TrendIcon)
    await register({ name: 'main', key: PANEL }, () => h(PanelBoundary, null, h(Panel, { ctx })))
  } catch (error) {
    removeStyles()
    throw error
  }
  return async () => {
    for (const dispose of disposables.reverse()) await dispose()
    removeStyles()
  }
}

exports.inject = inject
exports.apply = apply
    return module.exports;
  }
});
