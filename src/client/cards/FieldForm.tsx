import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CardApi, ConfirmDraft } from './api.js'
import type { DraftCard, DraftField } from './types.js'
import { fieldValue, isStatusBooleanLabel, paramsFromFields } from './parse.js'
import { insetPanelStyle, sectionLabelStyle } from './design.js'
import { PageShell } from './PageShell.js'
import { Button, FieldInput, SegmentedChoice, Switch, Tag } from './ui.js'

export interface FieldFormProps {
  api: CardApi
  draft: DraftCard
  token?: string
  onDecided?: (draft: ConfirmDraft) => void
}

export function FieldForm({ api, draft, token, onDecided }: FieldFormProps) {
  const initial = useMemo(() => {
    const values: Record<string, string> = {}
    for (const field of draft.fields) values[field.name] = fieldValue(field)
    return values
  }, [draft])
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [fieldError, setFieldError] = useState<string | undefined>(undefined)
  const [cancelArmed, setCancelArmed] = useState(false)
  const pending = draft.status === 'pending'
  const required = draft.fields.filter((field) => field.required)
  const optional = draft.fields.filter((field) => !field.required)

  const update = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }))
    setFieldError(undefined)
    setError(undefined)
  }
  const submit = async () => {
    const problem = validate(draft.fields, values)
    if (problem) {
      setFieldError(problem.field)
      setError(problem.message)
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const decided = await api.decide(draft.confirm_id, 'confirm', paramsFromFields(draft.fields, values), token)
      onDecided?.(decided)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '提交失败')
    } finally {
      setBusy(false)
    }
  }
  const cancel = async () => {
    if (!cancelArmed) {
      setCancelArmed(true)
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const decided = await api.decide(draft.confirm_id, 'cancel', undefined, token)
      onDecided?.(decided)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '取消失败')
    } finally {
      setBusy(false)
      setCancelArmed(false)
    }
  }

  const disabled = !pending || busy
  const footer = pending ? (
    <>
      <Button variant="primary" size="sm" disabled={busy} onClick={() => void submit()}>
        {busy ? '提交中…' : '确认执行'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        style={cancelArmed ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined}
        onClick={() => void cancel()}
      >
        {cancelArmed ? '确认取消' : '取消'}
      </Button>
      {cancelArmed ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setCancelArmed(false)}>返回</Button>
      ) : (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setValues(initial)}>恢复 LLM 原值</Button>
      )}
    </>
  ) : (
    <span style={{ font: 'var(--dsw-font-xxs-12)', color: 'var(--dsw-alias-label-tertiary)' }}>
      {statusText(draft.status)}{draft.task_id ? ` · ${draft.task_id}` : ''}{draft.message ? ` · ${draft.message}` : ''}
    </span>
  )

  return (
    <PageShell
      title={draft.action_name || draft.action}
      subtitle={draft.action_say || '确认前不会写入；确认后会重新校验权限和范围。'}
      trailing={<Tag tone={tagTone(draft.status)}>{statusLabel(draft.status)}</Tag>}
      footer={footer}
    >
      <GateSummary draft={draft} />
      {draft.message && pending ? (
        <details style={messageStyle}>
          <summary style={messageSummaryStyle}>助手说明</summary>
          <div style={messageBodyStyle}>{draft.message}</div>
        </details>
      ) : null}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingBottom: 12 }}>
        {riskTags(draft).map((tag) => <Tag key={tag.label} tone={tag.tone}>{tag.label}</Tag>)}
      </div>
      {required.length > 0 ? (
        <>
          <div style={{ ...sectionLabelStyle, paddingBottom: 6 }}>必填</div>
          <div style={insetPanelStyle}>
            {required.map((field, index) => renderField(field, index, values, update, fieldError, disabled))}
          </div>
        </>
      ) : null}
      {optional.length > 0 ? (
        <>
          <div style={{ ...sectionLabelStyle, padding: '16px 0 6px' }}>选填</div>
          <div style={insetPanelStyle}>
            {optional.map((field, index) => renderField(field, index, values, update, fieldError, disabled))}
          </div>
        </>
      ) : null}
      {error ? <p style={errorStyle}>{error}</p> : null}
    </PageShell>
  )
}

function GateSummary({ draft }: { draft: DraftCard }) {
  const gates = draft.risk.gates ?? []
  if (gates.length === 0) return null
  const failed = gates.filter((gate) => gate.status !== 'pass' && gate.status !== 'passed')
  if (failed.length === 0) {
    return (
      <div style={gateSummaryStyle}>
        <Tag tone="success">校验通过</Tag>
        <span>{gates.length} 项权限与范围检查已通过</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 12 }}>
      {failed.map((gate) => (
        <div key={gate.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <Tag tone={gate.status === 'fail' || gate.status === 'failed' ? 'danger' : 'warning'}>{gate.name}</Tag>
          <span style={{ font: 'var(--dsw-font-xxxs-11)', color: 'var(--dsw-alias-label-tertiary)' }}>{gate.reason}</span>
        </div>
      ))}
    </div>
  )
}

function renderField(
  field: DraftField,
  index: number,
  values: Record<string, string>,
  update: (name: string, value: string) => void,
  fieldError: string | undefined,
  disabled: boolean,
) {
  const value = values[field.name] ?? ''
  const invalid = fieldError === field.name
  const help = field.say && field.say !== field.label ? field.say : undefined
  const statusBoolean = isStatusBooleanLabel(field.label)
  const onLabel = statusBoolean ? '正常' : '是'
  const offLabel = statusBoolean ? '关闭' : '否'
  return (
    <div key={field.name} style={{ ...rowStyle, ...(index > 0 ? { borderTop: '0.5px solid var(--dsw-alias-border-l1)' } : {}) }}>
      <div style={labelStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          {field.label}
          {field.required ? <span style={{ color: 'var(--dsw-alias-state-error-primary)' }}>*</span> : null}
        </span>
        <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap' }}>
          {field.uncertain ? <Tag tone="warning">不确定</Tag> : null}
          {field.missing ? <Tag tone="warning">待补充</Tag> : null}
        </span>
      </div>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        {field.enum && field.enum.length > 0 ? (
          <select
            aria-label={field.label}
            style={{ ...controlStyle, ...(invalid ? invalidStyle : {}) }}
            value={value}
            disabled={disabled}
            onChange={(event) => update(field.name, event.target.value)}
          >
            <option value="">请选择</option>
            {field.enum.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : field.type === 'boolean' ? (
          field.required ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
              <Switch checked={value === 'true'} disabled={disabled} label={field.label} onChange={(next: boolean) => update(field.name, String(next))} />
              <span style={{ font: 'var(--dsw-font-xxs-12)', color: 'var(--dsw-alias-label-secondary)' }}>{value === 'true' ? onLabel : offLabel}</span>
            </span>
          ) : (
            <SegmentedChoice
              id={`eais-bool-${field.name}`}
              value={value}
              label={field.label}
              disabled={disabled}
              options={[{ value: '', label: '未设置' }, { value: 'true', label: onLabel }, { value: 'false', label: offLabel }]}
              onChange={(next) => update(field.name, next)}
            />
          )
        ) : field.type === 'object' || field.type === 'array' ? (
          <textarea
            aria-label={field.label}
            style={{ ...controlStyle, ...(invalid ? invalidStyle : {}), height: 88, padding: '6px 8px', resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
            value={value}
            disabled={disabled}
            placeholder="请输入 JSON"
            onChange={(event) => update(field.name, event.target.value)}
          />
        ) : (
          <FieldInput
            value={value}
            disabled={disabled}
            invalid={invalid}
            type={field.type === 'number' || field.type === 'integer' ? 'number' : field.type === 'date' ? 'date' : 'text'}
            placeholder="请输入"
            onChange={(next) => update(field.name, next)}
          />
        )}
        {help ? <div style={helpStyle}>{help}{field.unit ? `（${field.unit}）` : ''}</div> : null}
        {invalid ? <div style={{ ...helpStyle, color: 'var(--dsw-alias-state-error-primary)' }}>请检查这个字段</div> : null}
      </div>
    </div>
  )
}

function validate(fields: DraftField[], values: Record<string, string>): { field: string; message: string } | undefined {
  for (const field of fields) {
    const value = (values[field.name] ?? '').trim()
    if (field.required && value === '') {
      return { field: field.name, message: `请填写${field.label}` }
    }
    if (value !== '' && (field.type === 'number' || field.type === 'integer')) {
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || (field.type === 'integer' && !Number.isInteger(parsed))) {
        return { field: field.name, message: `${field.label}必须是${field.type === 'integer' ? '整数' : '数字'}` }
      }
    }
    if (value !== '' && (field.type === 'object' || field.type === 'array')) {
      try {
        JSON.parse(value)
      } catch {
        return { field: field.name, message: `${field.label}必须是合法 JSON` }
      }
    }
  }
  return undefined
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending': return '待确认'
    case 'executing': return '执行中'
    case 'done': return '已执行'
    case 'cancelled': return '已取消'
    case 'expired': return '已过期'
    case 'failed': return '失败'
    default: return status
  }
}

function statusText(status: string): string {
  switch (status) {
    case 'executing': return '正在执行'
    case 'done': return '已执行'
    case 'cancelled': return '已取消'
    case 'expired': return '已过期，请重新发起'
    case 'failed': return '执行失败'
    default: return status
  }
}

function tagTone(status: string): 'warning' | 'success' | 'danger' | 'outline' {
  if (status === 'done') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'pending' || status === 'executing') return 'warning'
  return 'outline'
}

function riskTags(draft: DraftCard): { label: string; tone: 'warning' | 'danger' }[] {
  const tags: { label: string; tone: 'warning' | 'danger' }[] = []
  if (draft.risk.high_risk) tags.push({ label: '高危', tone: 'danger' })
  if (draft.risk.requires_person) tags.push({ label: '只能本人', tone: 'warning' })
  if (draft.risk.requires_approval) tags.push({ label: '需审批', tone: 'warning' })
  return tags
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: '6px 12px',
  padding: '10px 12px',
}

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  width: 88,
  flex: 'none',
  paddingTop: 6,
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-secondary)',
}

const controlStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  height: 32,
  padding: '0 8px',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-md)',
  background: 'var(--dsw-alias-bg-base)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'var(--dsw-font-xs-13)',
  outline: 'none',
}

const invalidStyle: CSSProperties = {
  borderColor: 'var(--dsw-alias-state-error-primary)',
}

const helpStyle: CSSProperties = {
  marginTop: 4,
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
  lineHeight: '16px',
}

const gateSummaryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  paddingBottom: 12,
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
}

const messageStyle: CSSProperties = {
  marginBottom: 12,
  border: '0.5px solid var(--dsw-alias-state-warn-secondary)',
  borderRadius: 'var(--dsw-radius-sm)',
  background: 'var(--dsw-alias-state-warn-tertiary)',
  color: 'var(--dsw-alias-state-warn-label)',
  font: 'var(--dsw-font-xxs-12)',
}

const messageSummaryStyle: CSSProperties = {
  padding: '7px 10px',
  cursor: 'pointer',
  fontWeight: 500,
}

const messageBodyStyle: CSSProperties = {
  padding: '0 10px 8px',
  lineHeight: '18px',
}

const errorStyle: CSSProperties = {
  margin: '8px 0 0',
  font: 'var(--dsw-font-xxs-12)',
  color: 'var(--dsw-alias-state-error-primary)',
}
