import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CardColumn } from './types.js'
import { formatCell } from './parse.js'
import {
  columnRole, isNumericColumn, layoutWidths, statusTone, tableCellStyle, tableHeaderCellStyle,
} from './design.js'
import type { Density } from './tableState.js'
import { IconChevronDown, IconChevronUp, Tag } from './ui.js'

export interface TableViewProps {
  columns: CardColumn[]
  rows: Record<string, unknown>[]
  density: Density
  sort: string
  desc: boolean
  onSort: (key: string) => void
  onRowClick: (row: Record<string, unknown>) => void
}

export function TableView({
  columns, rows, density, sort, desc, onSort, onRowClick,
}: TableViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  const [hovered, setHovered] = useState<number | undefined>(undefined)
  const [focused, setFocused] = useState<number | undefined>(undefined)
  const widths = layoutWidths(columns, available > 0 ? available : 960)
  const total = widths.reduce((sum, value) => sum + value, 0)
  const filler = available > total ? available - total : 0
  const scrollable = total > available
  const rowHeight = density === 'compact' ? 32 : 40
  const firstRole = columns[0] ? columnRole(columns[0]) : 'text'
  const sticky = columns.length > 1 && (firstRole === 'code' || firstRole === 'name')

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => setAvailable(element.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 'auto',
        minHeight: 0,
        overflow: 'auto',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-base)',
      }}
    >
      <table style={{ width: total > available ? total : '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <colgroup>
          {columns.map((column, index) => <col key={column.key} style={{ width: widths[index] ?? 160 }} />)}
          {filler > 0 ? <col style={{ width: filler }} /> : null}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column, index) => {
              const numeric = isNumericColumn(column)
              const active = sort === column.key
              const headerStyle: CSSProperties = {
                ...tableHeaderCellStyle,
                textAlign: numeric ? 'right' : 'left',
                position: 'sticky',
                top: 0,
                zIndex: sticky && index === 0 ? 6 : 2,
                ...(sticky && index === 0 ? { ...stickyStyle(scrollable), zIndex: 6 } : {}),
              }
              return (
                <th
                  key={column.key}
                  style={headerStyle}
                  aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}
                  title={column.label}
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: numeric ? 'flex-end' : 'space-between',
                      gap: 2,
                      width: '100%',
                      height: '100%',
                      padding: 0,
                      border: 0,
                      background: 'transparent',
                      color: active ? 'var(--dsw-alias-label-primary)' : 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column.label}</span>
                    {active ? (desc ? <IconChevronDown size={12} /> : <IconChevronUp size={12} />) : null}
                  </button>
                </th>
              )
            })}
            {filler > 0 ? <th aria-hidden="true" style={{ ...tableHeaderCellStyle, position: 'sticky', top: 0, zIndex: 2 }} /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const hover = hovered === rowIndex
            const stickyBackground = hover
              ? 'color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-base))'
              : 'var(--dsw-alias-bg-base)'
            return (
              <tr
                key={rowIndex}
                tabIndex={0}
                onClick={() => onRowClick(row)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onRowClick(row)
                }}
                onMouseEnter={() => setHovered(rowIndex)}
                onMouseLeave={() => setHovered(undefined)}
                onFocus={() => setFocused(rowIndex)}
                onBlur={() => setFocused(undefined)}
                style={{
                  cursor: 'pointer',
                  height: rowHeight,
                  background: hover ? 'var(--dsw-alias-interactive-bg-hover)' : undefined,
                  outline: focused === rowIndex ? '2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent)' : 'none',
                  outlineOffset: -2,
                }}
              >
                {columns.map((column, index) => {
                  const text = formatCell(column, row[column.key])
                  const role = columnRole(column)
                  const numeric = isNumericColumn(column)
                  const cellStyle: CSSProperties = {
                    ...tableCellStyle,
                    height: rowHeight,
                    textAlign: numeric ? 'right' : 'left',
                    fontWeight: role === 'code' || role === 'name' ? 500 : 400,
                    fontVariantNumeric: numeric ? 'tabular-nums' : 'normal',
                    position: 'relative',
                    zIndex: 0,
                    ...(sticky && index === 0
                      ? { ...stickyStyle(scrollable), backgroundColor: stickyBackground, zIndex: 5 }
                      : {}),
                  }
                  return (
                    <td key={column.key} style={cellStyle} title={text}>
                      {role === 'status' && text !== '—'
                        ? <Tag tone={statusTone(text)}>{text}</Tag>
                        : text}
                    </td>
                  )
                })}
                {filler > 0 ? <td aria-hidden="true" style={{ ...tableCellStyle, height: rowHeight }} /> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function stickyStyle(scrollable: boolean): CSSProperties {
  return {
    position: 'sticky',
    left: 0,
    boxShadow: scrollable ? '8px 0 10px -8px rgba(15, 17, 21, 0.24)' : undefined,
  }
}
