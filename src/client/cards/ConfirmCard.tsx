import { useEffect, useMemo, useRef, useState } from 'react'
import type { CardApi } from './api.js'
import type { DraftCard, DraftField } from './types.js'
import { actionTitle, booleanText, fieldValue } from './parse.js'
import type { OpenResource } from './ResultCard.js'
import { CardShell } from './CardShell.js'
import { Button, Tag } from './ui.js'

export interface ConfirmCardProps {
  card: DraftCard
  api?: CardApi
  openResource?: OpenResource
}

interface LiveState {
  status: string
  message?: string
  task_id?: string
}

export function ConfirmCard({ card, api, openResource }: ConfirmCardProps) {
  const [live, setLive] = useState<LiveState | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const status = live?.status ?? card.status
  const terminal = status !== 'pending' && status !== 'executing'
  const pending = status === 'pending'

  useEffect(() => {
    if (!api || terminal) return
    let cancelled = false
    const poll = async () => {
      try {
        const current = await api.confirmation(card.confirm_id, card.confirm_token)
        if (cancelled) return
        setLive({ status: current.status, message: current.message, task_id: current.task_id })
        if (current.status === 'pending' || current.status === 'executing') {
          timer.current = setTimeout(() => void poll(), 2000)
        }
      } catch {
        if (!cancelled) timer.current = setTimeout(() => void poll(), 4000)
      }
    }
    timer.current = setTimeout(() => void poll(), 1500)
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [api, card.confirm_id, card.confirm_token, terminal])

  const keyFields = useMemo(() => keyFieldsOf(card), [card])
  const open = async () => {
    if (!openResource) {
      setFailure('确认面板不可用，请重新发起')
      return
    }
    try {
      await openResource(`dsh-resource://eais/confirm/${card.confirm_id}`, {
        params: { title: actionTitle(card), token: card.confirm_token },
      })
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '无法打开确认面板')
    }
  }

  const footer = pending ? (
    <Button
      variant="primary"
      size="sm"
      onClick={(event: { stopPropagation(): void }) => { event.stopPropagation(); void open() }}
    >
      核对并提交
    </Button>
  ) : (
    <span style={{ font: 'var(--dsw-font-xxxs-11)', color: 'var(--dsw-alias-label-tertiary)' }}>
      {statusText(status)}
      {live?.task_id ? ` · ${live.task_id}` : card.task_id ? ` · ${card.task_id}` : ''}
      {live?.message ?? card.message ? ` · ${live?.message ?? card.message}` : ''}
    </span>
  )

  return (
    <CardShell
      data={{ 'data-eais-confirm-card': card.confirm_id }}
      title={actionTitle(card)}
      trailing={<Tag tone={tagTone(status)}>{statusLabel(status)}</Tag>}
      subtitle="确认前不会写入；确认后会重新校验权限和范围。"
      footer={footer}
      onOpen={openResource ? () => void open() : undefined}
      openLabel={`${actionTitle(card)}，核对入参`}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        {keyFields.map((field) => (
          <div key={field.name} style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
            <span style={fieldLabelStyle}>{field.label}</span>
            <span
              style={{
                minWidth: 0,
                font: 'var(--dsw-font-xxs-12)',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: field.uncertain ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-primary)',
              }}
              title={fieldValue(field)}
            >
              {displayFieldValue(field) || (field.missing ? '待补充' : '—')}
            </span>
            {field.uncertain ? <span style={fieldTagStyle}><Tag tone="warning">不确定</Tag></span> : null}
            {field.missing ? <span style={fieldTagStyle}><Tag tone="warning">待补充</Tag></span> : null}
          </div>
        ))}
      </div>
      {riskTags(card).length > 0 ? (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {riskTags(card).map((tag) => (
            <Tag key={tag.label} tone={tag.tone}>{tag.label}</Tag>
          ))}
        </div>
      ) : null}
      {failure ? (
        <p style={{ margin: '8px 0 0', font: 'var(--dsw-font-xxxs-11)', color: 'var(--dsw-alias-state-error-primary)' }}>
          {failure}
        </p>
      ) : null}
    </CardShell>
  )
}

const fieldLabelStyle = {
  width: 64,
  flex: 'none',
  font: 'var(--dsw-font-xxxs-11)',
  color: 'var(--dsw-alias-label-tertiary)',
} as const

const fieldTagStyle = {
  flex: 'none',
} as const

function displayFieldValue(field: DraftField): string {
  const value = fieldValue(field)
  return booleanText(field.label, value) ?? value
}

function keyFieldsOf(card: DraftCard): DraftField[] {
  return card.fields
    .filter((field) => fieldValue(field) !== '' || field.uncertain || field.missing || field.required)
    .map((field) => ({
      field,
      score: (field.uncertain ? 4 : 0) + (field.missing ? 4 : 0) + (field.required ? 2 : 0) + (fieldValue(field) ? 1 : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((entry) => entry.field)
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

function riskTags(card: DraftCard): { label: string; tone: 'warning' | 'danger' }[] {
  const tags: { label: string; tone: 'warning' | 'danger' }[] = []
  if (card.risk.high_risk) tags.push({ label: '高危', tone: 'danger' })
  if (card.risk.requires_person) tags.push({ label: '只能本人', tone: 'warning' })
  if (card.risk.requires_approval) tags.push({ label: '需审批', tone: 'warning' })
  return tags
}
