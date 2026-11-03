import type { CSSProperties } from 'react'

export const cardStyle: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-1)',
  borderRadius: 'var(--dsw-radius-md)',
  boxShadow: 'var(--dsw-elevation-prominent)',
  color: 'var(--dsw-alias-label-primary)',
  padding: '14px 15px 13px',
}

export const panelStyle: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-sm)',
  color: 'var(--dsw-alias-label-primary)',
  padding: '9px 11px',
}

export const secondaryTextStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
}

export const captionTextStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  font: 'var(--dsw-font-xxxs-11)',
}

export const monoTextStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  lineHeight: '18px',
  fontVariantNumeric: 'tabular-nums',
}

export const groupLabelStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  font: 'var(--dsw-font-xxxs-11)',
  margin: '0 0 6px 2px',
}

export const groupCardStyle: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-sm)',
  color: 'var(--dsw-alias-label-primary)',
  overflow: 'hidden',
}

export const settingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minHeight: 38,
  boxSizing: 'border-box',
  padding: '8px 13px',
}

export const settingRowDividerStyle: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l1)',
}

export const settingLabelStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  font: 'var(--dsw-font-xs-13)',
}

export const settingValueStyle: CSSProperties = {
  marginLeft: 'auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'right',
  color: 'var(--dsw-alias-label-primary)',
  font: 'var(--dsw-font-xs-13)',
}

export const identityCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-sm)',
  padding: '11px 13px',
}

export const avatarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  flex: 'none',
  borderRadius: '50%',
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'var(--dsw-font-xxxs-11)',
  fontWeight: 500,
}

export const identityNameStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  font: 'var(--dsw-font-xs-13)',
  fontWeight: 500,
}

export const identityMetaStyle: CSSProperties = {
  marginTop: 1,
  color: 'var(--dsw-alias-label-tertiary)',
  font: 'var(--dsw-font-xxxs-11)',
}

export const formTitleStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  font: 'var(--dsw-font-xs-13)',
  fontWeight: 500,
}

export const fieldLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 4,
  color: 'var(--dsw-alias-label-tertiary)',
  font: 'var(--dsw-font-xxxs-11)',
}

export const inputStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  height: 32,
  padding: '5px 9px',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-sm)',
  color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-alias-bg-module-platform)',
  font: 'var(--dsw-font-xs-13)',
}

export const invalidInputStyle: CSSProperties = {
  border: '0.5px solid var(--dsw-alias-state-error-primary)',
}

export const primaryButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  minHeight: 32,
  padding: '5px 12px',
  border: '0.5px solid var(--dsw-alias-button-primary-fill)',
  borderRadius: 'var(--dsw-radius-sm)',
  color: 'var(--dsw-alias-label-primary-inverted)',
  background: 'var(--dsw-alias-button-primary-fill)',
  font: 'var(--dsw-font-xs-13)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
}

export const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  border: '0.5px solid var(--dsw-alias-border-l2)',
  color: 'var(--dsw-alias-label-primary)',
  background: 'transparent',
}

export const errorTextStyle: CSSProperties = {
  color: 'var(--dsw-alias-state-error-primary)',
  font: 'var(--dsw-font-xxs-12)',
}

export const warningStyle: CSSProperties = {
  padding: '7px 9px',
  border: '0.5px solid var(--dsw-alias-state-warn-secondary)',
  borderRadius: 'var(--dsw-radius-sm)',
  color: 'var(--dsw-alias-state-warn-label)',
  background: 'var(--dsw-alias-state-warn-tertiary)',
  font: 'var(--dsw-font-xs-13)',
}

export const sectionTitleStyle: CSSProperties = {
  font: 'var(--dsw-font-base-16)',
  fontWeight: 500,
}

export const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

export function disabledStyle(disabled: boolean): CSSProperties {
  return disabled ? { cursor: 'not-allowed', opacity: 0.55 } : {}
}
