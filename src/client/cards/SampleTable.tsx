import type { CSSProperties } from 'react'
import type { CardColumn } from './types.js'
import { formatCell } from './parse.js'

export function SampleTable({
  columns, rows, maxColumns = 4, maxRows = 3,
}: {
  columns: CardColumn[]
  rows: Record<string, unknown>[]
  maxColumns?: number
  maxRows?: number
}) {
  const visible = columns.slice(0, maxColumns)
  if (visible.length === 0 || rows.length === 0) return null
  return (
    <div style={{ overflowX: 'auto', minWidth: 0 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {visible.map((column) => (
              <th key={column.key} style={headStyle} title={column.label}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, maxRows).map((row, index) => (
            <tr key={index}>
              {visible.map((column) => {
                const text = formatCell(column, row[column.key])
                return <td key={column.key} style={cellStyle} title={text}>{text}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const tableStyle: CSSProperties = {
  width: '100%',
  minWidth: 480,
  borderCollapse: 'collapse',
  tableLayout: 'auto',
  font: 'var(--dsw-font-xxs-12)',
}

const headStyle: CSSProperties = {
  height: 26,
  padding: '0 8px',
  textAlign: 'left',
  font: 'var(--dsw-font-xxxs-11)',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-tertiary)',
  borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const cellStyle: CSSProperties = {
  height: 28,
  padding: '0 8px',
  borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
  color: 'var(--dsw-alias-label-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
