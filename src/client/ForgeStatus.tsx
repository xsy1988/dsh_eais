import { useCallback, useEffect, useState } from 'react'
import type { ClientContext } from '../port.js'

interface ForgeStatusProps {
  ctx: ClientContext
  props?: unknown
  dock?: boolean
  fetchImpl?: typeof fetch
}

interface ForgeState {
  active: boolean
  expiresAt?: string
  notice?: string
}

export function formatForgeRemaining(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function ForgeStatus({ props, dock = false, fetchImpl = fetch }: ForgeStatusProps) {
  const record = (props ?? {}) as { useSession?: (selector: (session: { sessionId?: unknown }) => unknown) => unknown }
  const sessionID = String(record.useSession?.((session) => session.sessionId) ?? '')
  const [state, setState] = useState<ForgeState>({ active: false })
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!sessionID) return
    try {
      const response = await fetchImpl(`/eais/forge/status?sessionId=${encodeURIComponent(sessionID)}`, { headers: { accept: 'application/json' } })
      if (!response.ok) return
      setState(await response.json() as ForgeState)
    } catch {
      // Keep the last visible state during a transient Host reconnect.
    }
  }, [fetchImpl, sessionID])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { setNow(Date.now()); void load() }, 1000)
    return () => clearInterval(timer)
  }, [load])

  const control = useCallback(async (action: 'extend' | 'end') => {
    if (!sessionID) return
    setBusy(true)
    setError('')
    try {
      const response = await fetchImpl('/eais/forge/control', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sessionId: sessionID, action }),
      })
      const payload = await response.json().catch(() => undefined) as (ForgeState & { error?: { message?: string } }) | undefined
      if (!response.ok) throw new Error(payload?.error?.message ?? '操作未完成，请重试')
      if (payload) setState(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }, [fetchImpl, sessionID])

  if (!state.active && (!dock || !state.notice)) return null
  const remaining = state.active && state.expiresAt ? Date.parse(state.expiresAt) - now : 0
  const warning = remaining > 0 && remaining <= 5 * 60 * 1000
  return <section aria-label="插件创作状态" style={{
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    padding: dock ? '7px 10px' : 0,
    border: dock ? '0.5px solid var(--dsw-alias-border-l2, #ddd)' : undefined,
    borderRadius: 'var(--dsw-radius-sm, 8px)',
    color: 'var(--dsw-alias-label-secondary, #555)', fontSize: 12,
  }}>
    {state.active ? <>
      <strong style={{ color: 'var(--dsw-alias-label-primary, #222)' }}>创作中</strong>
      <span role="status">剩 {formatForgeRemaining(remaining)}</span>
      {warning ? <span role="alert">快到期了，可以延长</span> : null}
      <button type="button" disabled={busy} onClick={() => void control('extend')}>延长</button>
      <button type="button" disabled={busy} onClick={() => void control('end')}>结束</button>
    </> : <span role="status">{state.notice}</span>}
    {error ? <span role="alert">{error}</span> : null}
  </section>
}
