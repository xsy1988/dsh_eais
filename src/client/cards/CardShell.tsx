import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  cardHoverStyle, cardSubtitleStyle, cardSurfaceStyle, cardTitleStyle,
} from './design.js'

export interface CardShellProps {
  title: string
  tag?: ReactNode
  trailing?: ReactNode
  subtitle?: ReactNode
  footer?: ReactNode
  children?: ReactNode
  onOpen?: () => void
  openLabel?: string
  data?: Record<string, string>
}

// One card surface for reads and writes. Cards are click targets, not toggle
// controls: no border, no focus ring, no selected state. The footer button is
// the keyboard-accessible action.
export function CardShell({
  title, tag, trailing, subtitle, footer, children, onOpen, data,
}: CardShellProps) {
  const [hover, setHover] = useState(false)
  const interactive = Boolean(onOpen)
  return (
    <section
      {...data}
      onClick={interactive ? (event) => {
        if (event.defaultPrevented) return
        onOpen?.()
      } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...cardSurfaceStyle,
        ...(hover && interactive ? cardHoverStyle : {}),
        cursor: interactive ? 'pointer' : 'default',
        outline: 'none',
        transition: 'background 120ms ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={cardTitleStyle} title={title}>{title}</span>
        {tag}
        {trailing ? <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center' }}>{trailing}</span> : null}
      </div>
      {subtitle ? <p style={cardSubtitleStyle}>{subtitle}</p> : null}
      {children ? <div style={{ marginTop: 8, minWidth: 0 }}>{children}</div> : null}
      {footer ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 28 }}>
          {footer}
        </div>
      ) : null}
    </section>
  )
}
