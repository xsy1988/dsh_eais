import type { ReactNode } from 'react'
import {
  breadcrumbStyle, pageHeaderStyle, pageStyle, pageSubtitleStyle, pageTitleStyle, toolButtonStyle,
} from './design.js'
import { IconChevronLeft } from './ui.js'

export interface PageShellProps {
  title: string
  subtitle?: ReactNode
  breadcrumb?: ReactNode
  onBack?: () => void
  trailing?: ReactNode
  footer?: ReactNode
  children?: ReactNode
  bodyScroll?: boolean
}

// One pane page: page margins, breadcrumb/back, title, a single scroll body,
// and an optional sticky footer. Every sidebar screen uses this frame.
export function PageShell({
  title, subtitle, breadcrumb, onBack, trailing, footer, children, bodyScroll = true,
}: PageShellProps) {
  return (
    <div style={pageStyle}>
      {onBack || breadcrumb ? (
        <div style={breadcrumbStyle}>
          {onBack ? (
            <button type="button" onClick={onBack} style={backStyle} aria-label="返回">
              <IconChevronLeft size={14} />
              <span>返回</span>
            </button>
          ) : null}
          {breadcrumb ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{breadcrumb}</span> : null}
        </div>
      ) : null}
      <header style={{ ...pageHeaderStyle, ...(onBack || breadcrumb ? { paddingTop: 2 } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <h1 style={pageTitleStyle} title={title}>{title}</h1>
          {trailing ? <span style={{ marginLeft: 'auto', flex: 'none', display: 'inline-flex' }}>{trailing}</span> : null}
        </div>
        {subtitle ? <div style={pageSubtitleStyle}>{subtitle}</div> : null}
      </header>
      <div style={{
        flex: 'auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: bodyScroll ? 'auto' : 'hidden',
      }}>
        {children}
      </div>
      {footer ? <div style={footerStyle}>{footer}</div> : null}
    </div>
  )
}

const backStyle = {
  ...toolButtonStyle,
  height: 22,
  padding: '0 4px',
  border: 0,
  color: 'var(--dsw-alias-label-tertiary)',
} as const

const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  flex: 'none',
  marginTop: 12,
  paddingTop: 12,
  borderTop: '0.5px solid var(--dsw-alias-border-l1)',
  background: 'var(--dsw-alias-bg-base)',
} as const
