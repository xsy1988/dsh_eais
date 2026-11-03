import type { CSSProperties, ReactNode } from 'react'

export type StatusTone = 'wait' | 'ok' | 'off' | 'error'

const toneStyles: Record<StatusTone, CSSProperties> = {
  wait: {
    color: 'var(--dsw-alias-state-warn-label)',
    background: 'var(--dsw-alias-state-warn-tertiary)',
  },
  ok: {
    color: 'var(--dsw-alias-state-success-primary)',
    background: 'var(--dsw-alias-state-success-tertiary)',
  },
  off: {
    color: 'var(--dsw-alias-label-tertiary)',
    background: 'var(--dsw-alias-bg-module-platform)',
  },
  error: {
    color: 'var(--dsw-alias-state-error-primary)',
    background: 'var(--dsw-alias-interactive-bg-hover-danger)',
  },
}

export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 'var(--dsw-radius-xs)',
      font: 'var(--dsw-font-xxxs-11)', fontWeight: 500, whiteSpace: 'nowrap',
      ...toneStyles[tone],
    }}>
      <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {children}
    </span>
  )
}
