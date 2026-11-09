import { useEffect, useState } from 'react'
import { countText, pageWindow } from './design.js'
import { Button, IconChevronLeft, IconChevronRight } from './ui.js'

export interface PaginationProps {
  offset: number
  limit: number
  matched: number
  total: number
  onOffsetChange: (offset: number) => void
  onLimitChange: (limit: number) => void
  cursorMode?: boolean
  canNext?: boolean
  onPreviousCursor?: () => void
  onNextCursor?: () => void
}

const PAGE_SIZES = [20, 50, 100]

export function Pagination({
  offset, limit, matched, total, onOffsetChange, onLimitChange,
  cursorMode = false, canNext = false, onPreviousCursor, onNextCursor,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(matched / Math.max(1, limit)))
  const current = Math.min(pageCount, Math.floor(offset / Math.max(1, limit)) + 1)
  const start = matched === 0 ? 0 : offset + 1
  const end = Math.min(offset + limit, matched)
  const [jump, setJump] = useState('')

  useEffect(() => {
    setJump(String(current))
  }, [current])

  const go = (page: number) => {
    const next = Math.min(pageCount, Math.max(1, page))
    onOffsetChange((next - 1) * limit)
  }
  const commitJump = () => {
    const page = Number(jump)
    if (!Number.isFinite(page)) {
      setJump(String(current))
      return
    }
    go(Math.trunc(page))
  }
  const sizes = PAGE_SIZES.includes(limit) ? PAGE_SIZES : [...PAGE_SIZES, limit].sort((a, b) => a - b)

  return (
    <div style={rootStyle}>
      <div style={metaStyle}>
        <span>共 {countText(total)} 条</span>
        {matched !== total ? <span>筛选后 {countText(matched)} 条</span> : null}
        <span>第 {countText(start)}–{countText(end)} 条</span>
      </div>
      <div style={controlsStyle}>
        <select
          aria-label="每页条数"
          value={limit}
          onChange={(event) => onLimitChange(Number(event.target.value))}
          style={selectStyle}
        >
          {sizes.map((size) => <option key={size} value={size}>{size} 条/页</option>)}
        </select>
        {cursorMode ? (
          <>
            <Button variant="ghost" size="sm" aria-label="上一页" disabled={offset <= 0} onClick={onPreviousCursor}>
              <IconChevronLeft size={14} />
            </Button>
            <span style={jumpLabelStyle}>第 {Math.floor(offset / Math.max(1, limit)) + 1} 页</span>
            <Button variant="ghost" size="sm" aria-label="下一页" disabled={!canNext} onClick={onNextCursor}>
              <IconChevronRight size={14} />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" style={pageButtonStyle} aria-label="首页" disabled={current <= 1} onClick={() => go(1)}>«</Button>
            <Button variant="ghost" size="sm" style={pageButtonStyle} aria-label="上一页" disabled={current <= 1} onClick={() => go(current - 1)}><IconChevronLeft size={14} /></Button>
            {pageWindow(current, pageCount).map((token, index) => token === 'ellipsis' ? (
              <span key={`e-${index}`} style={ellipsisStyle}>…</span>
            ) : (
              <button key={token} type="button" aria-label={`第 ${token} 页`} aria-current={token === current ? 'page' : undefined} onClick={() => go(token)} style={{ ...pageNumberStyle, ...(token === current ? activePageStyle : {}) }}>{token}</button>
            ))}
            <Button variant="ghost" size="sm" style={pageButtonStyle} aria-label="下一页" disabled={current >= pageCount} onClick={() => go(current + 1)}><IconChevronRight size={14} /></Button>
            <Button variant="ghost" size="sm" style={pageButtonStyle} aria-label="末页" disabled={current >= pageCount} onClick={() => go(pageCount)}>»</Button>
            <span style={jumpStyle}>
              <span style={jumpLabelStyle}>跳至</span>
              <input aria-label="跳至页码" value={jump} inputMode="numeric" onChange={(event) => setJump(event.target.value.replace(/[^0-9]/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') commitJump() }} onBlur={commitJump} style={jumpInputStyle} />
              <span style={jumpLabelStyle}>页</span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}

const rootStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 8,
  flex: 'none',
  width: '100%',
} as const

const metaStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
} as const

const controlsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  flexWrap: 'wrap',
  marginLeft: 'auto',
} as const

const selectStyle = {
  height: 28,
  padding: '0 6px',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-sm)',
  background: 'var(--dsw-alias-bg-base)',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'var(--dsw-font-xxs-12)',
  cursor: 'pointer',
} as const

const pageButtonStyle = {
  width: 28,
  minWidth: 28,
  padding: 0,
} as const

const pageNumberStyle = {
  minWidth: 28,
  height: 28,
  padding: '0 6px',
  boxSizing: 'border-box',
  border: '0.5px solid transparent',
  borderRadius: 'var(--dsw-radius-sm)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'var(--dsw-font-xxs-12)',
  fontVariantNumeric: 'tabular-nums',
  cursor: 'pointer',
} as const

const activePageStyle = {
  borderColor: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent)',
  background: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent)',
  color: 'var(--dsw-alias-state-business-primary)',
  fontWeight: 500,
} as const

const ellipsisStyle = {
  width: 20,
  textAlign: 'center',
  font: 'var(--dsw-font-xxs-12)',
  color: 'var(--dsw-alias-label-dimmed)',
} as const

const jumpStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginLeft: 4,
} as const

const jumpLabelStyle = {
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
} as const

const jumpInputStyle = {
  width: 40,
  height: 26,
  boxSizing: 'border-box',
  padding: '0 4px',
  textAlign: 'center',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-sm)',
  background: 'var(--dsw-alias-bg-base)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'var(--dsw-font-xxs-12)',
  fontVariantNumeric: 'tabular-nums',
} as const
