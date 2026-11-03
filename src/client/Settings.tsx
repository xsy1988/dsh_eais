import { useEffect, useState, type FormEvent } from 'react'
import type { FetchLike } from '../api.js'
import {
  failure,
  initialPublicState,
  type EaisConfig,
  type EaisFailure,
  type EaisPublicState,
} from '../contracts.js'
import { isDisposable, readSettings, settingsControllerOf, writeSettings, type ClientContext } from '../port.js'
import { expiryState, loginSession, logoutSession, changePasswordSession } from '../session.js'
import {
  avatarStyle,
  captionTextStyle,
  disabledStyle,
  errorTextStyle,
  fieldLabelStyle,
  formTitleStyle,
  groupCardStyle,
  groupLabelStyle,
  identityCardStyle,
  identityMetaStyle,
  identityNameStyle,
  inputStyle,
  invalidInputStyle,
  monoTextStyle,
  primaryButtonStyle,
  rowStyle,
  secondaryButtonStyle,
  secondaryTextStyle,
  sectionTitleStyle,
  settingLabelStyle,
  settingRowDividerStyle,
  settingRowStyle,
  settingValueStyle,
  warningStyle,
} from './styles.js'
import { StatusPill, type StatusTone } from './StatusPill.js'

export interface SettingsProps {
  ctx: ClientContext
  config?: EaisConfig
  fetchImpl?: FetchLike
  onLogout?: () => Promise<void>
}

interface CapabilityRow {
  label: string
  detail: string
  phase: EaisPublicState['mcp']['phase']
  reason?: EaisFailure | null
}

interface FieldErrors {
  serverUrl?: string
  staffNo?: string
  password?: string
}

export function Settings({ ctx, config = {}, fetchImpl = fetch, onLogout }: SettingsProps) {
  const [serverUrl, setServerUrl] = useState(config.serverUrl ?? '')
  const [staffNo, setStaffNo] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<EaisPublicState>(() => initialPublicState(config.serverUrl ? 'logged-out' : 'unconfigured'))
  const [reauth, setReauth] = useState(false)
  const [passwordForm, setPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const settings = await readSettings(settingsControllerOf(ctx))
        if (!active) return
        if (settings.serverUrl) setServerUrl(settings.serverUrl)
        if (settings.state) {
          setState(settings.state)
          if (settings.state.status === 'logged-out') setNotice(undefined)
        }
      } catch (reason) {
        if (active) setError(failure(reason).message)
      }
    }
    void load()
    const subscribe = ctx.remote.$on ? ctx.remote.$on.bind(ctx.remote) : ctx.on?.bind(ctx)
    const subscription = subscribe?.('settings/document-updated', (namespace) => {
      if (typeof namespace === 'string' && namespace !== 'eais') return
      void load()
    })
    return () => {
      active = false
      if (typeof subscription === 'function') subscription()
      else if (isDisposable(subscription)) void subscription.dispose()
    }
  }, [ctx])

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const missing: FieldErrors = {}
    if (!serverUrl.trim()) missing.serverUrl = '请填写服务器地址。'
    if (!staffNo.trim()) missing.staffNo = '请填写工号。'
    if (!password) missing.password = '请填写密码。'
    setFieldErrors(missing)
    if (Object.keys(missing).length) {
      setError(undefined)
      setNotice(undefined)
      const first = missing.serverUrl ? 'eais-server-url' : missing.staffNo ? 'eais-staff-no' : 'eais-password'
      requestAnimationFrame(() => document.getElementById(first)?.focus())
      return
    }
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const result = await loginSession({
        settings: settingsControllerOf(ctx),
        credentials: ctx.remote.credentials,
        fetchImpl,
        serverUrl,
        staffNo,
        password,
        pendingState: (login) => ({
          ...initialPublicState('connecting'),
          staff: login.staff,
          expiresAt: login.expiresAt,
        }),
      })
      const connecting: EaisPublicState = {
        ...initialPublicState('connecting'),
        staff: result.staff,
        expiresAt: result.expiresAt,
      }
      setServerUrl(result.serverUrl)
      const saved = await readSettings(settingsControllerOf(ctx)).catch(() => undefined)
      setState(saved?.state ?? connecting)
      setReauth(false)
      setPassword('')
    } catch (reason) {
      setPassword('')
      setError(failure(reason).message)
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      if (onLogout) {
        await onLogout()
      } else if (ctx.remote.credentials.resolve) {
        await logoutSession({ credentials: ctx.remote.credentials, fetchImpl, serverUrl })
      } else {
        // The browser cannot read a Host credential; ask the Host to revoke.
        await writeSettings(settingsControllerOf(ctx), {
          serverUrl,
          state,
          logoutRequestedAt: new Date().toISOString(),
        })
        setNotice('已请求服务端吊销员工卡，等待确认…')
        return
      }
      const loggedOut = initialPublicState('logged-out')
      await writeSettings(settingsControllerOf(ctx), { serverUrl, state: loggedOut, logoutRequestedAt: '' })
      setState(loggedOut)
      setReauth(false)
    } catch (reason) {
      setError(failure(reason).message)
    } finally {
      setBusy(false)
    }
  }

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault()
    setError(undefined)
    setNotice(undefined)
    if (!currentPassword || !newPassword) {
      setError('请填写当前密码和新密码。')
      return
    }
    if (newPassword.length < 12) {
      setError('新密码至少 12 位。')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。')
      return
    }
    const staff = state.staff?.no?.trim()
    if (!staff) {
      setError('当前员工信息缺失，请重新登录后再修改密码。')
      return
    }
    setBusy(true)
    try {
      await changePasswordSession({
        settings: settingsControllerOf(ctx),
        credentials: ctx.remote.credentials,
        fetchImpl,
        serverUrl,
        staffNo: staff,
        currentPassword,
        newPassword,
      })
      setState(initialPublicState('logged-out'))
      setStaffNo(staff)
      setPasswordForm(false)
      setReauth(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice('密码已修改，旧员工卡已吊销。请使用新密码重新登录。')
    } catch (reason) {
      setError(failure(reason).message)
    } finally {
      setBusy(false)
    }
  }

  async function reconnectMcp() {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const saved = await readSettings(settingsControllerOf(ctx)).catch(() => ({}))
      await writeSettings(settingsControllerOf(ctx), {
        ...saved,
        serverUrl,
        state,
        mcpReconnectRequestedAt: new Date().toISOString(),
      })
      setNotice('已发起重连，无需手动确认；请看下方「MCP 工具」状态。')
      window.setTimeout(() => setNotice(undefined), 6000)
    } catch (reason) {
      setError(failure(reason).message)
    } finally {
      setBusy(false)
    }
  }

  const connecting = state.status === 'connecting'
  const expired = state.status === 'expired' || expiryState(state.expiresAt) === 'expired'
  const expiring = expiryState(state.expiresAt) === 'expiring'
  const connected = !expired && (connecting || state.status === 'ready' || state.status === 'degraded')
  const showForm = !connected || reauth
  const tone = reauth
    ? 'wait'
    : expired
      ? 'wait'
      : connecting
        ? 'wait'
        : state.status === 'ready'
          ? 'ok'
          : state.status === 'degraded'
            ? 'wait'
            : state.status === 'failed'
              ? 'error'
              : 'off'
  const statusLabel = reauth
    ? '换卡中'
    : connecting
      ? '连接中'
      : state.status === 'ready'
        ? '已连接'
        : state.status === 'degraded'
          ? '已连接（降级）'
          : expired
            ? '卡已过期'
            : state.status === 'failed'
              ? '连接失败'
              : '未登录'
  const days = remainingDays(state.expiresAt)
  const initials = state.staff?.name?.trim().slice(0, 1).toUpperCase()

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-label="企业模式设置">
      <div style={{ ...rowStyle, alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={sectionTitleStyle}>企业模式</div>
          <p style={{ ...captionTextStyle, marginTop: 2 }}>开启EAIS，允许使用企业模型，并可对企业内部数据进行读写操作</p>
        </div>
        <StatusPill tone={tone}>{statusLabel}</StatusPill>
      </div>

      {state.staff?.name && state.status !== 'logged-out' && state.status !== 'unconfigured' ? (
        <div style={identityCardStyle}>
          <span style={avatarStyle} aria-hidden="true">{initials}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...identityNameStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.staff.name}{state.staff.dept ? ` · ${state.staff.dept}` : ''}
            </div>
            <div style={identityMetaStyle}>
              {state.staff.no}{state.expiresAt ? ` · 卡有效至 ${formatExpiry(state.expiresAt)}` : ''}
            </div>
          </div>
          {expired ? (
            <span style={{ ...captionTextStyle, color: 'var(--dsw-alias-state-warn-label)', whiteSpace: 'nowrap' }}>已过期</span>
          ) : days !== undefined ? (
            <span style={{
              ...captionTextStyle,
              color: expiring ? 'var(--dsw-alias-state-warn-label)' : 'var(--dsw-alias-label-tertiary)',
              whiteSpace: 'nowrap',
            }}>剩余 {days} 天</span>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          style={{ ...groupCardStyle, display: 'flex', flexDirection: 'column', gap: 12, padding: '13px 13px 12px' }}
        >
          {expired ? <div role="alert" style={warningStyle}>卡已过期，企业能力已暂停。请重新登录。</div> : null}
          {reauth ? <div role="alert" style={warningStyle}>换卡会吊销当前员工卡，成功后使用新卡。</div> : null}
          <div>
            <div style={formTitleStyle}>{reauth ? '换卡登录' : expired ? '重新登录' : '登录员工卡'}</div>
            <p style={{ ...captionTextStyle, marginTop: 2 }}>
              {reauth ? '使用新员工卡完成认证。' : '使用管理员发放的工号和密码。'}
            </p>
          </div>
          <label>
            <span style={fieldLabelStyle}>服务器地址</span>
            <input
              id="eais-server-url"
              style={{
                ...inputStyle,
                ...(config.serverUrlReadOnly ? { color: 'var(--dsw-alias-label-tertiary)' } : {}),
                ...(fieldErrors.serverUrl ? invalidInputStyle : {}),
              }}
              value={serverUrl}
              readOnly={config.serverUrlReadOnly}
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.serverUrl)}
              aria-describedby={fieldErrors.serverUrl ? 'eais-server-url-error' : undefined}
              onChange={(event) => {
                setServerUrl(event.target.value)
                clearFieldError('serverUrl')
              }}
              placeholder="https://eais.corp.example"
            />
            {fieldErrors.serverUrl ? <span id="eais-server-url-error" role="alert" style={{ ...errorTextStyle, display: 'block', marginTop: 4 }}>{fieldErrors.serverUrl}</span> : null}
          </label>
          <label>
            <span style={fieldLabelStyle}>工号</span>
            <input
              id="eais-staff-no"
              style={{ ...inputStyle, ...(fieldErrors.staffNo ? invalidInputStyle : {}) }}
              value={staffNo}
              autoComplete="username"
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.staffNo)}
              aria-describedby={fieldErrors.staffNo ? 'eais-staff-no-error' : undefined}
              onChange={(event) => {
                setStaffNo(event.target.value)
                clearFieldError('staffNo')
              }}
            />
            {fieldErrors.staffNo ? <span id="eais-staff-no-error" role="alert" style={{ ...errorTextStyle, display: 'block', marginTop: 4 }}>{fieldErrors.staffNo}</span> : null}
          </label>
          <label>
            <span style={fieldLabelStyle}>密码</span>
            <input
              id="eais-password"
              style={{ ...inputStyle, ...(fieldErrors.password ? invalidInputStyle : {}) }}
              value={password}
              type="password"
              autoComplete="current-password"
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'eais-password-error' : undefined}
              onChange={(event) => {
                setPassword(event.target.value)
                clearFieldError('password')
              }}
            />
            {fieldErrors.password ? <span id="eais-password-error" role="alert" style={{ ...errorTextStyle, display: 'block', marginTop: 4 }}>{fieldErrors.password}</span> : null}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
            <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, width: '100%', ...disabledStyle(busy) }}>
              {busy ? '正在登录…' : expired ? '重新登录' : reauth ? '换卡登录' : '登录'}
            </button>
            {reauth ? (
              <button
                type="button"
                style={{ ...secondaryButtonStyle, width: '100%' }}
                onClick={() => {
                  setReauth(false)
                  setPassword('')
                  setFieldErrors({})
                  setError(undefined)
                }}
              >取消换卡</button>
            ) : null}
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ ...captionTextStyle, margin: 0 }}>{expiryNotice(state.expiresAt)}</p>
          <CapabilityList state={state} />
          {passwordForm ? (
            <form
              noValidate
              onSubmit={(event) => void submitPasswordChange(event)}
              style={{ ...groupCardStyle, display: 'flex', flexDirection: 'column', gap: 12, padding: '13px 13px 12px' }}
            >
              <div>
                <div style={formTitleStyle}>修改登录密码</div>
                <p style={{ ...captionTextStyle, marginTop: 2 }}>
                  新密码至少 12 位，修改后 180 天内有效；所有已签发的员工卡会立即吊销，需要重新登录。
                </p>
              </div>
              <label>
                <span style={fieldLabelStyle}>当前密码</span>
                <input
                  id="eais-current-password"
                  style={inputStyle}
                  value={currentPassword}
                  type="password"
                  autoComplete="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label>
                <span style={fieldLabelStyle}>新密码</span>
                <input
                  id="eais-new-password"
                  style={inputStyle}
                  value={newPassword}
                  type="password"
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <label>
                <span style={fieldLabelStyle}>确认新密码</span>
                <input
                  id="eais-confirm-password"
                  style={inputStyle}
                  value={confirmPassword}
                  type="password"
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              <div style={{ ...rowStyle, marginTop: 2 }}>
                <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, ...disabledStyle(busy) }}>
                  {busy ? '正在修改…' : '确认修改'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={{ ...secondaryButtonStyle, ...disabledStyle(busy) }}
                  onClick={() => {
                    setPasswordForm(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                    setError(undefined)
                  }}
                >取消</button>
              </div>
            </form>
          ) : null}
          <div>
            <p style={{ ...captionTextStyle, margin: 0 }}>换卡会吊销当前员工卡并重新认证；退出会清除本地凭据并卸载企业模型。</p>
            <div style={{ ...rowStyle, marginTop: 10 }}>
              <button
                type="button"
                disabled={busy}
                style={{ ...primaryButtonStyle, ...disabledStyle(busy) }}
                onClick={() => {
                  setReauth(true)
                  setError(undefined)
                  setPassword('')
                  setFieldErrors({})
                }}
              >换卡</button>
              <button
                type="button"
                disabled={busy}
                style={{ ...secondaryButtonStyle, ...disabledStyle(busy) }}
                title="使用当前密码设置新密码；修改后需要重新登录"
                onClick={() => {
                  setPasswordForm((open) => !open)
                  setError(undefined)
                  setNotice(undefined)
                }}
              >修改密码</button>
              <button
                type="button"
                disabled={busy}
                style={{ ...secondaryButtonStyle, ...disabledStyle(busy) }}
                title="吊销当前员工卡，吊销确认后清除本地凭据并卸载企业模型"
                onClick={() => void logout()}
              >退出</button>
              <button
                type="button"
                disabled={busy}
                style={{ ...secondaryButtonStyle, ...disabledStyle(busy) }}
                title="用当前员工卡重新挂载 MCP；刷新或更改工具 schema 后使用"
                onClick={() => void reconnectMcp()}
              >重连 MCP</button>
            </div>
          </div>
        </div>
      )}

      {error ? <p role="alert" style={{ ...errorTextStyle, margin: 0 }}>{error}</p> : null}
      {notice ? <p style={{ ...secondaryTextStyle, margin: 0 }}>{notice}</p> : null}
      {state.reason ? <p role="alert" style={{ ...errorTextStyle, margin: 0 }}>{state.reason.message}</p> : null}
    </section>
  )
}

function CapabilityList({ state }: { state: EaisPublicState }) {
  const rows: CapabilityRow[] = [
    {
      label: '企业模型',
      detail: state.models.length ? `${state.models.length} 档可用` : '',
      phase: state.llm.phase,
      reason: state.llm.reason,
    },
    { label: 'MCP 工具', detail: mcpDetail(state.mcp), phase: state.mcp.phase, reason: state.mcp.reason },
    { label: '卡片', detail: '', phase: state.ui.card.phase, reason: state.ui.card.reason },
    { label: '面板', detail: '', phase: state.ui.panel.phase, reason: state.ui.panel.reason },
    { label: '按钮', detail: '', phase: state.ui.buttons.phase, reason: state.ui.buttons.reason },
  ]
  return (
    <section>
      <div style={groupLabelStyle}>企业能力</div>
      <div style={groupCardStyle}>
        {rows.map((row, index) => (
          <div key={row.label} style={index ? settingRowDividerStyle : undefined}>
            <div style={settingRowStyle}>
              <span style={settingLabelStyle}>{row.label}</span>
              <span style={{ ...settingValueStyle, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                {row.detail ? <span style={captionTextStyle}>{row.detail}</span> : null}
                <StatusPill tone={phaseTone(row.phase)}>{phaseLabel(row.phase)}</StatusPill>
              </span>
            </div>
            {row.reason ? (
              <p role="alert" style={{ ...errorTextStyle, margin: 0, padding: '0 13px 8px' }}>{row.reason.message}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function mcpDetail(state: EaisPublicState['mcp']): string {
  if (state.phase === 'ready') return '已挂载，工具可用'
  if (state.phase === 'failed') return '已降级'
  return ''
}

function phaseTone(phase: CapabilityRow['phase']): StatusTone {
  switch (phase) {
    case 'ready': return 'ok'
    case 'failed': return 'error'
    case 'mounting': return 'wait'
    default: return 'off'
  }
}

function phaseLabel(phase: CapabilityRow['phase']): string {
  switch (phase) {
    case 'disabled': return '未启用'
    case 'idle': return '未挂载'
    case 'mounting': return '挂载中'
    case 'ready': return '可用'
    case 'failed': return '不可用'
  }
}

function formatExpiry(expiresAt: string | undefined): string {
  if (!expiresAt) return '未知'
  const timestamp = Date.parse(expiresAt)
  if (!Number.isFinite(timestamp)) return expiresAt
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function remainingDays(expiresAt: string | undefined): number | undefined {
  if (!expiresAt) return undefined
  const timestamp = Date.parse(expiresAt)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 86_400_000))
}

function expiryNotice(expiresAt: string | undefined): string {
  switch (expiryState(expiresAt)) {
    case 'expired': return '员工卡已过期，需要重新登录。'
    case 'expiring': return '员工卡将在 7 天内到期；L0 不自动续期，到期后需要重新登录。'
    case 'valid': return 'L0 不自动续期，到期后需要重新登录。'
    case 'unknown': return '无法读取到期时间；若模型调用被拒绝，请重新登录。'
  }
}
