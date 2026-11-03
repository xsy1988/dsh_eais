import { useEffect, useMemo, useState } from 'react'
import type { CardApi } from './api.js'
import type { CardColumn, DatasetCard } from './types.js'
import { actionTitle } from './parse.js'
import { countText, orderColumns } from './design.js'
import { CardShell } from './CardShell.js'
import { SampleTable } from './SampleTable.js'
import { Button, IconChevronRight, Tag } from './ui.js'

export type OpenResource = (address: string, options?: { params?: Record<string, unknown> }) => void | Promise<void>

export interface ResultCardProps {
  card: DatasetCard
  api?: CardApi
  openResource?: OpenResource
}

export function ResultCard({ card, api, openResource }: ResultCardProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(Boolean(card.view_id && card.view_token && api))
  const [error, setError] = useState<string | undefined>(undefined)
  const columns = useMemo(
    () => orderColumns(card.columns as CardColumn[], card.display_columns).slice(0, 4),
    [card.columns, card.display_columns],
  )

  useEffect(() => {
    if (!card.view_id || !card.view_token || !api) {
      setLoading(false)
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(undefined)
    api.rows(card.view_id, { limit: 3 }, card.view_token)
      .then((page) => {
        if (cancelled) return
        setRows(page.rows ?? [])
      })
      .catch((failure: Error) => {
        if (!cancelled) setError(failure.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [api, card.view_id, card.view_token])

  const open = () => {
    if (!card.view_id || !openResource) return
    void openResource(`dsh-resource://eais/dataset/${card.view_id}`, {
      params: {
        title: actionTitle(card),
        columns: card.columns,
        display_columns: card.display_columns,
        total: card.total,
        rows_returned: card.rows_returned,
        complete: card.complete,
        token: card.view_token,
      },
    })
  }

  const openable = Boolean(card.view_id && openResource)
  const count = `${countText(card.total)} 条`
  const footer = openable ? (
    <Button
      variant="ghost"
      size="sm"
      style={{ marginLeft: 'auto' }}
      onClick={(event: { stopPropagation(): void }) => { event.stopPropagation(); open() }}
    >
      查看全部 {count}
      <IconChevronRight size={14} />
    </Button>
  ) : null

  return (
    <CardShell
      data={{ 'data-eais-result-card': card.action }}
      title={actionTitle(card)}
      tag={<Tag tone="neutral">{count}</Tag>}
      subtitle={subtitleOf(card)}
      footer={footer}
      onOpen={openable ? open : undefined}
      openLabel={`${actionTitle(card)}，${count}，打开明细`}
    >
      <CardBody
        loading={loading}
        error={error}
        empty={card.total === 0 || (!loading && !error && rows.length === 0)}
        columns={columns}
        rows={rows}
      />
    </CardShell>
  )
}

function CardBody({
  loading, error, empty, columns, rows,
}: {
  loading: boolean
  error?: string
  empty: boolean
  columns: CardColumn[]
  rows: Record<string, unknown>[]
}) {
  if (loading) return <p style={hintStyle}>正在读取样例…</p>
  if (error) return <p style={{ ...hintStyle, color: 'var(--dsw-alias-state-error-primary)' }}>{error}</p>
  if (empty) return <p style={hintStyle}>没有匹配的数据。</p>
  return <SampleTable columns={columns} rows={rows} maxColumns={4} maxRows={3} />
}

function subtitleOf(card: DatasetCard): string {
  if (card.total === 0) return '没有匹配的数据'
  const parts = distributionText(card)
  if (!card.complete) parts.push('已截断')
  if (parts.length === 0) parts.push(`${countText(card.total)} 条记录`)
  return parts.join(' · ')
}

function distributionText(card: DatasetCard): string[] {
  const usable = (card.distribution ?? []).filter((distribution) => {
    if (!distribution.buckets || distribution.buckets.length === 0) return false
    return !/单位|编码|编号|名称|代码|料号/.test(distribution.label ?? distribution.field)
  })
  const chosen = usable[0]
  if (!chosen) return []
  return (chosen.buckets ?? [])
    .slice(0, 3)
    .map((bucket) => `${bucket.label && bucket.label !== bucket.value ? bucket.label : bucket.value} ${countText(bucket.count)}`)
}

const hintStyle = {
  margin: 0,
  font: 'var(--dsw-font-xxs-12)',
  color: 'var(--dsw-alias-label-tertiary)',
} as const
