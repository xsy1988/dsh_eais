import type { ReactNode } from 'react'
import { IconWarning } from './ui.js'

export function EmptyState({
  title, description, action, danger,
}: {
  title: string
  description?: string
  action?: ReactNode
  danger?: boolean
}) {
  return (
    <div style={rootStyle}>
      <span style={{ color: danger ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-tertiary)' }}>
        <IconWarning size={24} />
      </span>
      <div style={{ ...titleStyle, ...(danger ? { color: 'var(--dsw-alias-state-error-primary)' } : {}) }}>{title}</div>
      {description ? <div style={descriptionStyle}>{description}</div> : null}
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  )
}

const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 180,
  padding: '24px 16px',
  textAlign: 'center',
} as const

const titleStyle = {
  font: 'var(--dsw-font-xs-strong-13)',
  fontWeight: 500,
  color: 'var(--dsw-alias-label-primary)',
} as const

const descriptionStyle = {
  maxWidth: 320,
  font: 'var(--dsw-font-xxs-12)',
  color: 'var(--dsw-alias-label-tertiary)',
  lineHeight: '18px',
} as const
