import { useEffect, useRef, useState } from 'react'
import type { CardColumn } from './types.js'
import { columnRole, sectionLabelStyle, toolButtonStyle } from './design.js'
import { moveKey } from './tableState.js'
import { Button, Checkbox, IconSettings } from './ui.js'

export interface ColumnSettingsProps {
  columns: CardColumn[]
  order: string[]
  hidden: string[]
  onHiddenChange: (next: string[]) => void
  onOrderChange: (next: string[]) => void
  onReset: () => void
}

export function ColumnSettings({
  columns, order, hidden, onHiddenChange, onOrderChange, onReset,
}: ColumnSettingsProps) {
  const [open, setOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const byKey = new Map(columns.map((column) => [column.key, column]))
  const ordered = order.map((key) => byKey.get(key)).filter((column): column is CardColumn => column !== undefined)
  const visibleCount = ordered.length - hidden.length

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  const toggle = (key: string) => {
    if (hidden.includes(key)) {
      onHiddenChange(hidden.filter((candidate) => candidate !== key))
      return
    }
    if (visibleCount <= 1) return
    onHiddenChange([...hidden, key])
  }

  const move = (from: number, to: number) => {
    const next = moveKey(order, from, to)
    if (next !== order) onOrderChange(next)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        style={{ ...toolButtonStyle, ...(open ? activeStyle : {}) }}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <IconSettings size={14} />
        列 {visibleCount}/{ordered.length}
      </button>
      {open ? (
        <div role="dialog" aria-label="列设置" style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 8px' }}>
            <span style={sectionLabelStyle}>显示列</span>
            <span style={{ ...sectionLabelStyle, fontWeight: 400 }}>{visibleCount}/{ordered.length}</span>
            <span style={{ ...sectionLabelStyle, fontWeight: 400, color: 'var(--dsw-alias-label-dimmed)' }}>拖动排序</span>
            <button
              type="button"
              style={{ ...linkStyle, marginLeft: 'auto' }}
              onClick={() => onHiddenChange([])}
            >
              全部显示
            </button>
          </div>
          <div style={{ display: 'grid', gap: 1, maxHeight: 320, overflow: 'auto' }}>
            {ordered.map((column, index) => {
              const checked = !hidden.includes(column.key)
              const role = columnRole(column)
              return (
                <div
                  key={column.key}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== undefined) move(dragIndex, index)
                    setDragIndex(undefined)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    minHeight: 30, padding: '0 2px', borderRadius: 'var(--dsw-radius-xs)',
                    background: dragIndex === index ? 'var(--dsw-alias-interactive-bg-hover)' : undefined,
                    opacity: dragIndex === index ? 0.55 : 1,
                  }}
                >
                  <span
                    draggable
                    title="拖动排序"
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => setDragIndex(undefined)}
                    style={dragHandleStyle}
                    aria-hidden="true"
                  >
                    ⋮⋮
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Checkbox
                      checked={checked}
                      label={column.label}
                      disabled={checked && visibleCount <= 1}
                      onChange={() => toggle(column.key)}
                      title={role === 'object' ? '长文本/JSON 列' : undefined}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 2px 2px', borderTop: '0.5px solid var(--dsw-alias-border-l1)', marginTop: 6 }}>
            <Button variant="ghost" size="sm" onClick={() => { onReset(); setOpen(false) }}>恢复默认</Button>
            <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>完成</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const panelStyle = {
  position: 'absolute',
  top: 34,
  right: 0,
  zIndex: 30,
  width: 288,
  padding: 8,
  boxSizing: 'border-box',
  background: 'var(--dsw-alias-bg-layer-1)',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-md)',
  boxShadow: 'var(--dsw-elevation-prominent)',
} as const

const activeStyle = {
  borderColor: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, transparent)',
  color: 'var(--dsw-alias-state-business-primary)',
} as const

const linkStyle = {
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'var(--dsw-alias-state-business-primary)',
  font: 'var(--dsw-font-xxxs-11)',
  cursor: 'pointer',
} as const

const dragHandleStyle = {
  width: 14,
  flex: 'none',
  color: 'var(--dsw-alias-label-dimmed)',
  font: 'var(--dsw-font-xxxs-11)',
  letterSpacing: -1,
  cursor: 'grab',
  userSelect: 'none',
} as const
