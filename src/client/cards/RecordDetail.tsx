import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CardColumn } from './types.js'
import { formatCell } from './parse.js'
import { columnRole, primaryCell, sectionLabelStyle, statusTone, textOf } from './design.js'
import { PageShell } from './PageShell.js'
import { Button, IconCheck, IconCopy, Tag } from './ui.js'

export interface RecordDetailProps {
  columns: CardColumn[]
  row: Record<string, unknown>
  actionName: string
  onBack: () => void
}

export function RecordDetail({ columns, row, actionName, onBack }: RecordDetailProps) {
  const primary = useMemo(() => primaryCell(columns, row), [columns, row])
  const status = useMemo(() => {
    const column = columns.find((candidate) => columnRole(candidate) === 'status' && textOf(row[candidate.key]))
    return column ? { label: formatCell(column, row[column.key]), tone: statusTone(formatCell(column, row[column.key])) } : undefined
  }, [columns, row])
  const [copied, setCopied] = useState<string | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(undefined), 1500)
    } catch {
      setCopied(undefined)
    }
  }

  const rowJSON = useMemo(() => {
    try {
      return JSON.stringify(row, null, 2)
    } catch {
      return String(row)
    }
  }, [row])

  return (
    <PageShell
      title={primary.title}
      subtitle={primary.subtitle}
      breadcrumb={`${actionName} / 记录详情`}
      onBack={onBack}
      trailing={status ? <Tag tone={status.tone}>{status.label}</Tag> : undefined}
      footer={(
        <>
          <Button variant="ghost" size="sm" onClick={() => void copy('__row__', rowJSON)}>
            {copied === '__row__' ? <IconCheck size={13} /> : <IconCopy size={13} />}
            {copied === '__row__' ? '已复制' : '复制整行 JSON'}
          </Button>
          <Button variant="primary" size="sm" style={{ marginLeft: 'auto' }} onClick={onBack}>
            返回列表
          </Button>
        </>
      )}
    >
      <div style={{ ...sectionLabelStyle, paddingBottom: 8 }}>字段信息</div>
      <div style={gridStyle}>
        {columns.map((column) => {
          const value = row[column.key]
          const text = formatCell(column, value)
          const role = columnRole(column)
          const long = role === 'object' || text.length > 80 || /备注|描述|地址|说明|内容/.test(column.label)
          return (
            <div key={column.key} style={{ minWidth: 0, gridColumn: long ? '1 / -1' : undefined }}>
              <div style={labelStyle}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column.label}</span>
                {text !== '—' ? (
                  <button
                    type="button"
                    aria-label={`复制${column.label}`}
                    title={`复制${column.label}`}
                    onClick={() => void copy(column.key, text)}
                    style={copyButtonStyle}
                  >
                    {copied === column.key ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  </button>
                ) : null}
              </div>
              <Value column={column} text={text} long={long} tone={statusTone(text)} />
            </div>
          )
        })}
      </div>
    </PageShell>
  )
}

function Value({
  column, text, long, tone,
}: {
  column: CardColumn
  text: string
  long: boolean
  tone: 'success' | 'warning' | 'danger' | 'neutral'
}) {
  if (text === '—') return <div style={{ ...valueStyle, color: 'var(--dsw-alias-label-dimmed)' }}>—</div>
  if (columnRole(column) === 'status') return <div style={{ paddingTop: 1 }}><Tag tone={tone}>{text}</Tag></div>
  if (long) {
    return (
      <div style={longValueStyle}>
        {column.type === 'object' || column.type === 'array' ? prettyJSON(text) : text}
      </div>
    )
  }
  return <div style={valueStyle}>{text}</div>
}

function prettyJSON(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '14px 18px',
  alignContent: 'start',
  paddingBottom: 8,
} as const

const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  minWidth: 0,
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
} as const

const valueStyle = {
  marginTop: 3,
  font: 'var(--dsw-font-xs-13)',
  color: 'var(--dsw-alias-label-primary)',
  lineHeight: '20px',
  wordBreak: 'break-word',
} as const

const longValueStyle: CSSProperties = {
  ...valueStyle,
  marginTop: 4,
  maxHeight: 260,
  overflow: 'auto',
  padding: '8px 10px',
  border: '0.5px solid var(--dsw-alias-border-l1)',
  borderRadius: 'var(--dsw-radius-sm)',
  background: 'var(--dsw-alias-bg-layer-1)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  lineHeight: '18px',
  whiteSpace: 'pre-wrap',
}

const copyButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  padding: 0,
  border: 0,
  borderRadius: 'var(--dsw-radius-xs)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer',
  opacity: 0.8,
} as const
