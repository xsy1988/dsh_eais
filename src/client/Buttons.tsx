import { useEffect, useRef, useState } from 'react'
import { EaisError } from '../contracts.js'
import { disabledStyle, errorTextStyle, primaryButtonStyle, rowStyle, secondaryButtonStyle } from './styles.js'

export interface DecisionAction {
  label: string
  value: string
  tone?: 'primary' | 'secondary' | 'danger'
}

export interface ButtonsProps {
  actions: DecisionAction[]
  onDecision?: (value: string) => Promise<void>
  fallbackUrl?: string
}

export function Buttons({ actions, onDecision, fallbackUrl }: ButtonsProps) {
  const [confirmation, setConfirmation] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function decide(action: DecisionAction) {
    setFailure(undefined)
    if (confirmation !== action.value) {
      setConfirmation(action.value)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setConfirmation(undefined), 2000)
      return
    }
    if (!onDecision) {
      setFailure('表态通道不可用；请使用一次性确认链接，不能改成聊天文字同意。')
      return
    }
    setBusy(true)
    try {
      await onDecision(action.value)
      setCompleted(action.value)
      setConfirmation(undefined)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '表态失败，请使用一次性确认链接。')
    } finally {
      setBusy(false)
    }
  }

  if (!actions.length && !fallbackUrl) {
    return <p style={errorTextStyle}>没有可用表态按钮，也未提供一次性确认链接。</p>
  }

  return (
    <div>
      <div style={rowStyle}>
        {actions.map((action) => {
          const disabled = Boolean(completed) || busy || (!onDecision && !fallbackUrl)
          const confirming = confirmation === action.value
          const label = completed === action.value
            ? '已表态'
            : busy && confirming
              ? '提交中…'
              : confirming
                ? '再点一次确认'
                : action.label
          return (
            <button
              key={action.value}
              type="button"
              disabled={disabled}
              style={{
                ...(action.tone === 'secondary' ? secondaryButtonStyle : primaryButtonStyle),
                ...disabledStyle(disabled),
              }}
              onClick={() => void decide(action)}
            >
              {label}
            </button>
          )
        })}
      </div>
      {failure ? <p role="alert" style={errorTextStyle}>{failure}</p> : null}
      {!onDecision || failure ? (
        fallbackUrl
          ? <a href={fallbackUrl} target="_blank" rel="noreferrer">使用一次性确认链接</a>
          : <p style={errorTextStyle}>一次性确认链接不可用，请联系管理员。</p>
      ) : null}
    </div>
  )
}

export function unavailableDecision(): Promise<void> {
  return Promise.reject(new EaisError('E_DECISION_UNAVAILABLE', '人意提交通道未配置'))
}
