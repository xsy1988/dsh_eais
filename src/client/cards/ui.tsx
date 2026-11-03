import { createElement } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  inputStyle, primaryButtonStyle, secondaryButtonStyle, disabledStyle,
} from '../styles.js'

declare const require: (id: string) => unknown

type Primitive = (props: any) => ReactNode

interface PrimitiveKit {
  Button?: Primitive
  Input?: Primitive
  Tag?: Primitive
  Switch?: Primitive
  Checkbox?: Primitive
  SegmentedControl?: Primitive
  IconSearchOutlineRegular?: Primitive
  IconSettingsOutlineRegular?: Primitive
  IconRefreshOutlineRegular?: Primitive
  IconChevronDownOutlineRegular?: Primitive
  IconChevronLeftOutlineRegular?: Primitive
  IconChevronRightOutlineRegular?: Primitive
  IconChevronUpOutlineRegular?: Primitive
  IconCloseOutlineRegular?: Primitive
  IconCloseOutlineMedium?: Primitive
  IconCopyOutlineRegular?: Primitive
  IconCheckOutlineRegular?: Primitive
  IconWarningTriangleOutlineRegular?: Primitive
  IconLoadingOutlineRegular?: Primitive
  IconSearchOutlineMedium?: Primitive
  IconSettingsOutlineMedium?: Primitive
}

function loadPrimitives(): PrimitiveKit {
  try {
    return (require('@deepseek-ai/dsh-client-ui-primitives') as PrimitiveKit) ?? {}
  } catch {
    return {}
  }
}

const kit = loadPrimitives()

export const hasPrimitives = Boolean(kit.Button && kit.Input && kit.Tag)

export const Button: Primitive = kit.Button ?? (function FallbackButton({
  variant = 'ghost', size = 'md', children, disabled, ...rest
}: any) {
  const compact = size === 'sm'
  const style: CSSProperties = {
    ...(variant === 'primary' ? primaryButtonStyle : secondaryButtonStyle),
    ...(compact ? { minHeight: 28, height: 28, padding: '0 10px', font: 'var(--dsw-font-xxs-12)' } : {}),
    ...disabledStyle(Boolean(disabled)),
  }
  return createElement('button', { type: 'button', style, disabled, ...rest }, children)
})

export const Input: Primitive = kit.Input ?? (function FallbackInput({ style, ...rest }: any) {
  return createElement('input', { style: { ...inputStyle, ...style }, ...rest })
})

export const Tag: Primitive = kit.Tag ?? (function FallbackTag({ tone = 'outline', children }: any) {
  return createElement('span', { style: tagStyle(tone) }, children)
})

export const Switch: Primitive = kit.Switch ?? (function FallbackSwitch({
  checked, onChange, label, disabled,
}: any) {
  return createElement('input', {
    type: 'checkbox', checked: Boolean(checked), 'aria-label': label, disabled,
    onChange: (event: { target: { checked: boolean } }) => onChange?.(event.target.checked),
  })
})

export const Checkbox: Primitive = kit.Checkbox ?? (function FallbackCheckbox({
  checked, onChange, label, disabled, title,
}: any) {
  return createElement('label', {
    title,
    style: {
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px',
      color: disabled ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-label-secondary)',
      font: 'var(--dsw-font-xxs-12)', cursor: disabled ? 'not-allowed' : 'pointer',
    },
  }, [
    createElement('input', {
      key: 'input', type: 'checkbox', checked: Boolean(checked), disabled,
      onChange: (event: { target: { checked: boolean } }) => onChange?.(event.target.checked),
    }),
    createElement('span', { key: 'label' }, label),
  ])
})

export function SegmentedChoice({
  id = 'eais-segment', value, options, onChange, label, disabled,
}: {
  id?: string
  value: string
  options: { value: string; label: string }[]
  onChange: (next: string) => void
  label: string
  disabled?: boolean
}) {
  if (kit.SegmentedControl) {
    return createElement(kit.SegmentedControl, {
      id, value, options, onChange, label, disabled,
    })
  }
  return createElement('div', {
    role: 'group', 'aria-label': label,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2,
      border: '0.5px solid var(--dsw-alias-border-l2)',
      borderRadius: 'var(--dsw-radius-sm)', background: 'var(--dsw-alias-bg-layer-1)',
    },
  }, options.map((option) => createElement('button', {
    key: option.value, type: 'button', disabled,
    'aria-pressed': value === option.value,
    onClick: () => onChange(option.value),
    style: {
      height: 24, padding: '0 8px', border: 0,
      borderRadius: 'var(--dsw-radius-xs)',
      background: value === option.value ? 'var(--dsw-alias-bg-base)' : 'transparent',
      color: value === option.value ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
      font: 'var(--dsw-font-xxs-12)', cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: value === option.value ? '0 0 0 0.5px var(--dsw-alias-border-l2)' : undefined,
    },
  }, option.label)))
}

// A full-width field wrapper: the primitive Input's style lands on the native
// input, so a grid parent is what stretches the primitive's inline-flex shell.
export function FieldInput({
  value, onChange, placeholder, disabled, invalid, type = 'text',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  type?: string
}) {
  return createElement('div', { style: { display: 'grid', minWidth: 0 } },
    createElement(Input, {
      style: { width: '100%', ...(invalid ? { borderColor: 'var(--dsw-alias-state-error-primary)' } : {}) },
      type, value, disabled, placeholder,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    }))
}

type IconComponent = (props: { size?: number }) => ReactNode

function icon(name: keyof PrimitiveKit): IconComponent {
  const component = kit[name]
  if (!component) return () => null
  return (props: { size?: number }) => createElement(component, props)
}

export const IconSearch = icon('IconSearchOutlineRegular')
export const IconSettings = icon('IconSettingsOutlineRegular')
export const IconRefresh = icon('IconRefreshOutlineRegular')
export const IconChevronDown = icon('IconChevronDownOutlineRegular')
export const IconChevronLeft = icon('IconChevronLeftOutlineRegular')
export const IconChevronRight = icon('IconChevronRightOutlineRegular')
export const IconChevronUp = icon('IconChevronUpOutlineRegular')
export const IconClose = icon('IconCloseOutlineRegular')
export const IconCopy = icon('IconCopyOutlineRegular')
export const IconCheck = icon('IconCheckOutlineRegular')
export const IconWarning = icon('IconWarningTriangleOutlineRegular')
export const IconLoading = icon('IconLoadingOutlineRegular')

function tagStyle(tone: string): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    padding: '0 7px',
    borderRadius: 999,
    font: 'var(--dsw-font-xxxs-11)',
    whiteSpace: 'nowrap',
  }
  switch (tone) {
    case 'success':
      return { ...base, background: 'var(--dsw-alias-state-success-tertiary)', color: 'var(--dsw-alias-state-success-primary)' }
    case 'warning':
      return { ...base, background: 'var(--dsw-alias-state-warn-tertiary)', color: 'var(--dsw-alias-state-warn-label)' }
    case 'danger':
      return { ...base, background: 'var(--dsw-alias-state-error-tertiary)', color: 'var(--dsw-alias-state-error-primary)' }
    case 'info':
      return { ...base, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-state-business-primary)' }
    default:
      return { ...base, border: '0.5px solid var(--dsw-alias-border-l2)', color: 'var(--dsw-alias-label-tertiary)' }
  }
}
