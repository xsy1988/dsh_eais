import { useMemo } from 'react'
import { cardStyle, disabledStyle, rowStyle, secondaryButtonStyle, secondaryTextStyle } from './styles.js'
import { StatusPill } from './StatusPill.js'

const VIEW_MARKER = /\[\[eais-view:(v_[a-z0-9]+)\]\]/g

export interface CardSummary {
  actionName?: string
  subject?: string
  status?: string
}

export interface CardProps {
  text: string
  summary?: CardSummary
  onOpen?: (viewId: string) => void | Promise<void>
}

export function extractViewIds(text: string): string[] {
  return [...text.matchAll(VIEW_MARKER)].map((match) => match[1]!)
}

export function Card({ text, summary, onOpen }: CardProps) {
  const viewId = useMemo(() => extractViewIds(text)[0], [text])
  if (!viewId) return <span>{text}</span>
  return (
    <article style={cardStyle} data-view-id={viewId}>
      <div style={rowStyle}>
        <StatusPill tone="wait">{summary?.status ?? '待处理'}</StatusPill>
        <span style={secondaryTextStyle}>{summary?.actionName ?? '业务确认'}</span>
      </div>
      <div style={{ marginTop: 11, fontWeight: 500 }}>{summary?.subject ?? '需要人工查看'}</div>
      <div style={{ ...secondaryTextStyle, marginTop: 3 }}>{viewId}</div>
      <button
        type="button"
        style={{ ...secondaryButtonStyle, ...disabledStyle(!onOpen), marginTop: 12 }}
        disabled={!onOpen}
        title={onOpen ? '打开一次性面板' : '面板通道不可用，请使用原文中的确认链接'}
        onClick={() => void onOpen?.(viewId)}
      >
        打开
      </button>
      {!onOpen ? <p style={secondaryTextStyle}>面板不可用，请使用工具结果中的一次性链接。</p> : null}
    </article>
  )
}
