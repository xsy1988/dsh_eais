import type { CSSProperties } from 'react'
import type { CardColumn } from './types.js'

// Single source of truth for the card and right-pane visual language. Every
// value is a --dsw-* token or a color-mix over tokens, so light and dark mode
// move together and no component carries its own palette.

export type ColumnRole = 'code' | 'name' | 'status' | 'number' | 'date' | 'object' | 'text'

export const cardSurfaceStyle: CSSProperties = {
  boxSizing: 'border-box',
  backgroundColor: 'var(--dsw-alias-bg-base)',
  background: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-base))',
  borderRadius: 'var(--dsw-radius-lg)',
  color: 'var(--dsw-alias-label-primary)',
  padding: '12px 14px',
  width: '100%',
  minWidth: 0,
}

// Hover only shifts the tint; cards never draw a border or a selected state.
export const cardHoverStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, var(--dsw-alias-bg-base))',
}

export const cardTitleStyle: CSSProperties = {
  font: 'var(--dsw-font-xs-strong-13)',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-primary)',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const cardSubtitleStyle: CSSProperties = {
  margin: '2px 0 0',
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
}

export const cardSectionGap = 8

export const pageStyle: CSSProperties = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  padding: '16px 20px 24px',
  color: 'var(--dsw-alias-label-primary)',
}

export const pageHeaderStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  paddingBottom: 12,
  flex: 'none',
}

export const pageTitleStyle: CSSProperties = {
  margin: 0,
  font: 'var(--dsw-font-s-strong-14)',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-primary)',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const pageSubtitleStyle: CSSProperties = {
  margin: 0,
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
}

export const breadcrumbStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minHeight: 24,
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
}

export const sectionLabelStyle: CSSProperties = {
  font: 'var(--dsw-font-xxxs-11)',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-tertiary)',
}

export const tableHeaderCellStyle: CSSProperties = {
  height: 36,
  padding: '0 12px',
  boxSizing: 'border-box',
  textAlign: 'left',
  font: 'var(--dsw-font-xxxs-11)',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-tertiary)',
  background: 'var(--dsw-alias-bg-base)',
  borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export const tableCellStyle: CSSProperties = {
  padding: '0 12px',
  boxSizing: 'border-box',
  borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
  font: 'var(--dsw-font-xxs-12)',
  color: 'var(--dsw-alias-label-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export const toolButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  height: 28,
  padding: '0 10px',
  boxSizing: 'border-box',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-sm)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'var(--dsw-font-xxs-12)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const toolButtonActiveStyle: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, transparent)',
  color: 'var(--dsw-alias-state-business-primary)',
  background: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, transparent)',
}

export const insetPanelStyle: CSSProperties = {
  boxSizing: 'border-box',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-md)',
  background: 'var(--dsw-alias-bg-layer-1)',
  overflow: 'hidden',
}

const CODE_KEYS = ['code', 'no', 'id', 'number', 'sku', 'sn', 'barcode', 'serial']
const CODE_LABELS = ['编码', '编号', '代码', '料号', '单号', '工号', '条码', '序号']
const NAME_KEYS = ['name', 'title', 'label']
const NAME_LABELS = ['名称', '姓名', '品名', '标题', '简称']
const STATUS_KEYS = ['status', 'state', 'type', 'category', 'level', 'stage', 'kind']
const DATE_TYPES = ['date', 'datetime', 'time']

export function columnRole(column: CardColumn): ColumnRole {
  const key = column.key.toLowerCase()
  const label = column.label ?? ''
  if (/owner|staff|contact|phone|mobile|email|address/.test(key)) {
    if (column.type === 'number' || column.type === 'integer') return 'number'
    return 'text'
  }
  if (CODE_KEYS.some((needle) => key === needle || key.endsWith(`_${needle}`)) || CODE_LABELS.some((needle) => label.includes(needle))) {
    return 'code'
  }
  if (NAME_KEYS.some((needle) => key.includes(needle)) || NAME_LABELS.some((needle) => label.includes(needle))) {
    return 'name'
  }
  if (column.type === 'object' || column.type === 'array') return 'object'
  if (column.type === 'number' || column.type === 'integer' || column.type === 'decimal') return 'number'
  if (DATE_TYPES.includes(column.type)) return 'date'
  if (column.enum && column.enum.length > 0) return 'status'
  if (STATUS_KEYS.some((needle) => key.includes(needle)) || /状态|类型|分类|等级|阶段/.test(label)) {
    return 'status'
  }
  return 'text'
}

// Codes lead, names second, then the server's display order, then everything
// else. The result is stable for columns with equal priority.
export function orderColumns(columns: CardColumn[], display: string[] | undefined): CardColumn[] {
  if (columns.length === 0) return []
  const byKey = new Map(columns.map((column) => [column.key, column]))
  const code = columns.find((column) => columnRole(column) === 'code')
  const name = columns.find((column) => columnRole(column) === 'name' && column.key !== code?.key)
  const priority: string[] = []
  if (code) priority.push(code.key)
  if (name) priority.push(name.key)
  for (const key of display ?? []) priority.push(key)
  for (const column of columns) priority.push(column.key)
  const seen = new Set<string>()
  const ordered: CardColumn[] = []
  for (const key of priority) {
    const column = byKey.get(key)
    if (!column || seen.has(key)) continue
    seen.add(key)
    ordered.push(column)
  }
  return ordered
}

export interface ColumnWidth {
  min: number
  max: number
  preferred: number
}

export function columnWidth(role: ColumnRole): ColumnWidth {
  switch (role) {
    case 'code': return { min: 110, max: 220, preferred: 160 }
    case 'name': return { min: 160, max: 320, preferred: 220 }
    case 'status': return { min: 96, max: 140, preferred: 112 }
    case 'number': return { min: 96, max: 160, preferred: 120 }
    case 'date': return { min: 140, max: 180, preferred: 152 }
    case 'object': return { min: 200, max: 420, preferred: 260 }
    default: return { min: 160, max: 360, preferred: 200 }
  }
}

// Distribute the container across columns without ever crossing min/max.
export function layoutWidths(columns: CardColumn[], container: number): number[] {
  if (columns.length === 0) return []
  const widths = columns.map((column) => columnWidth(columnRole(column)))
  const base = widths.map((width) => width.preferred)
  const totalBase = base.reduce((sum, value) => sum + value, 0)
  const available = Math.max(container, widths.reduce((sum, width) => sum + width.min, 0))
  let next = base.slice()
  if (available <= totalBase) {
    const floor = widths.map((width) => width.min)
    const totalFloor = floor.reduce((sum, value) => sum + value, 0)
    if (available <= totalFloor) return floor
    const ratio = (available - totalFloor) / (totalBase - totalFloor)
    next = floor.map((value, index) => Math.round(value + (base[index]! - value) * ratio))
  } else {
    let remaining = available - totalBase
    const caps = widths.map((width) => width.max - width.preferred)
    while (remaining > 0) {
      const open = caps.map((cap, index) => (next[index]! < widths[index]!.max ? index : -1)).filter((index) => index >= 0)
      if (open.length === 0) break
      const share = Math.max(1, Math.floor(remaining / open.length))
      let moved = 0
      for (const index of open) {
        if (remaining <= 0) break
        const room = widths[index]!.max - next[index]!
        const add = Math.min(room, share, remaining)
        next[index] = next[index]! + add
        remaining -= add
        moved += add
      }
      if (moved === 0) break
    }
  }
  return next
}

export type PageToken = number | 'ellipsis'

export function pageWindow(current: number, pageCount: number): PageToken[] {
  if (pageCount <= 0) return []
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  let start = Math.max(2, current - 1)
  let end = Math.min(pageCount - 1, current + 1)
  if (current <= 3) { start = 2; end = 4 }
  if (current >= pageCount - 2) { start = pageCount - 3; end = pageCount - 1 }
  const tokens: PageToken[] = [1]
  if (start > 2) tokens.push('ellipsis')
  for (let page = start; page <= end; page += 1) tokens.push(page)
  if (end < pageCount - 1) tokens.push('ellipsis')
  tokens.push(pageCount)
  return tokens
}

export function countText(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('zh-CN') : '0'
}

const SUCCESS = ['active', 'enabled', 'normal', 'ok', 'success', '正常', '启用', '有效', '已完成', '已通过']
const WARNING = ['pending', 'waiting', 'draft', 'todo', '待处理', '待确认', '进行中', '草稿']
const DANGER = ['failed', 'error', 'disabled', 'invalid', '失败', '异常', '停用', '已拒绝']

export function statusTone(value: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const text = value.trim().toLowerCase()
  if (SUCCESS.some((needle) => text === needle || text.includes(needle))) return 'success'
  if (DANGER.some((needle) => text === needle || text.includes(needle))) return 'danger'
  if (WARNING.some((needle) => text === needle || text.includes(needle))) return 'warning'
  return 'neutral'
}

export function isNumericColumn(column: CardColumn): boolean {
  return column.type === 'number' || column.type === 'integer' || column.type === 'decimal'
}

export function primaryCell(columns: CardColumn[], row: Record<string, unknown>): { title: string; subtitle?: string } {
  const code = columns.find((column) => columnRole(column) === 'code')
  const name = columns.find((column) => columnRole(column) === 'name')
  const title = textOf(code ? row[code.key] : undefined) || textOf(name ? row[name.key] : undefined) || '记录详情'
  const nameText = textOf(name ? row[name.key] : undefined)
  const other = code ? textOf(row[code.key]) : ''
  return {
    title,
    subtitle: nameText && nameText !== title ? nameText : (other && other !== title ? other : undefined),
  }
}

export function textOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}
