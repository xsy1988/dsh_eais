import { useEffect, useMemo, useState } from 'react'
import type { CardApi, ConfirmDraft } from './api.js'
import type { CardColumn, DraftCard } from './types.js'
import { addressOf, navigationOf, parseAddress } from './parse.js'
import { DataSetPage } from './DataSetPage.js'
import { FieldForm } from './FieldForm.js'
import { PageShell } from './PageShell.js'
import { EmptyState } from './EmptyState.js'
import { mergePaneParams, recallPaneTitle, rememberPane } from './paneState.js'

export interface EaisPaneProps {
  api: CardApi
  props?: unknown
  inputActions?: { setDraft(text: string): void; submit(): void }
  useTabInfo?: () => { tab?: { navigation?: { address?: string; params?: Record<string, unknown> } } } | undefined
  useInput?: (selector: (state: { phase: string }) => unknown) => unknown
}

export function EaisPane({ api, props, inputActions, useTabInfo, useInput }: EaisPaneProps) {
  const phase = (useInput?.((state) => state.phase) as string | undefined) ?? 'plain'
  const tabInfo = useTabInfo?.()
  const rawAddress = tabInfo?.tab?.navigation?.address ?? addressOf(props)
  const address = useMemo(() => parseAddress(rawAddress), [rawAddress])
  const navigation = useMemo(() => tabInfo?.tab?.navigation?.params ?? navigationOf(props), [tabInfo, props])
  const params = useMemo(() => mergePaneParams(rawAddress, navigation), [rawAddress, navigation])
  const token = typeof params.token === 'string' ? params.token : undefined

  useEffect(() => {
    if (!token) return
    rememberPane(rawAddress, {
      token,
      ...(typeof params.title === 'string' ? { title: params.title } : {}),
      ...(typeof params.action === 'string' ? { action: params.action } : {}),
      ...(params.columns !== undefined ? { columns: params.columns } : {}),
      ...(params.display_columns !== undefined ? { display_columns: params.display_columns } : {}),
      ...(typeof params.total === 'number' ? { total: params.total } : {}),
      ...(typeof params.rows_returned === 'number' ? { rows_returned: params.rows_returned } : {}),
      ...(params.complete === true ? { complete: true } : {}),
    })
  }, [rawAddress, token, params.title, params.action, params.columns, params.display_columns, params.total, params.rows_returned, params.complete])
  const [draft, setDraft] = useState<ConfirmDraft | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [autoContinued, setAutoContinued] = useState(false)

  useEffect(() => {
    if (!address || address.kind !== 'confirm') return
    let cancelled = false
    setLoading(true)
    setError(undefined)
    api.confirmation(address.id, token)
      .then((value) => { if (!cancelled) setDraft(value) })
      .catch((failure: Error) => { if (!cancelled) setError(failure.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [api, address?.id, address?.kind, token])

  if (!address) {
    return (
      <PageShell title="企业数据">
        <EmptyState title="无法识别这个卡片地址" description="请回到对话，从卡片重新打开。" />
      </PageShell>
    )
  }

  if (address.kind === 'dataset') {
    if (!token) {
      return (
        <PageShell title={typeof params.title === 'string' ? params.title : '查询结果'}>
          <EmptyState title="该页面已失效" description="请从对话里的卡片重新打开。" />
        </PageShell>
      )
    }
    return (
      <DataSetPage
        api={api}
        viewId={address.id}
        title={typeof params.title === 'string' ? params.title : undefined}
        action={typeof params.action === 'string' ? params.action : undefined}
        initialColumns={params.columns as CardColumn[] | undefined}
        initialDisplay={params.display_columns as string[] | undefined}
        initialTotal={typeof params.total === 'number' ? params.total : undefined}
        initialReturned={typeof params.rows_returned === 'number' ? params.rows_returned : undefined}
        initialComplete={params.complete === true}
        token={token}
      />
    )
  }

  if (!token) {
    return (
      <PageShell title={typeof params.title === 'string' ? params.title : '确认'}>
        <EmptyState title="这次确认已结束" description="请从对话里的卡片重新打开。" />
      </PageShell>
    )
  }
  if (loading && !draft) {
    return (
      <PageShell title={typeof params.title === 'string' ? params.title : '确认'}>
        <EmptyState title="正在读取确认信息…" />
      </PageShell>
    )
  }
  if (error) {
    return (
      <PageShell title={typeof params.title === 'string' ? params.title : '确认'}>
        <EmptyState danger title="读取确认失败" description={error} />
      </PageShell>
    )
  }
  if (!draft) {
    return (
      <PageShell title={typeof params.title === 'string' ? params.title : '确认'}>
        <EmptyState title="这次确认不存在或已过期" description="请回到对话，从卡片重新发起。" />
      </PageShell>
    )
  }

  const card: DraftCard = {
    eais: 'card/v1', kind: 'draft',
    status: draft.status as DraftCard['status'],
    confirm_id: draft.confirm_id, action: draft.action, action_name: draft.action_name,
    action_say: draft.action_say, risk: draft.risk, fields: draft.fields, message: draft.message,
    task_id: draft.task_id, result: draft.result, expires_at: draft.expires_at,
  }
  const decided = (value: ConfirmDraft) => {
    setDraft(value)
    if (value.status !== 'done' || !inputActions || phase !== 'plain' || autoContinued) return
    const text = value.task_id
      ? `已确认「${value.action_name || value.action}」，任务号 ${value.task_id}。请用 task 查询并简短汇总，不要重复明细。`
      : `已确认「${value.action_name || value.action}」。请查询执行结果并简短汇总，不要重复明细。`
    try {
      inputActions.setDraft(text)
      inputActions.submit()
      setAutoContinued(true)
    } catch {
      // The user can still reopen the card if the host refuses the draft.
    }
  }
  return <FieldForm api={api} draft={card} token={token} onDecided={decided} />
}

export function EaisPaneTitle({ props, useTabInfo }: { props?: unknown; useTabInfo?: EaisPaneProps['useTabInfo'] }) {
  const tabInfo = useTabInfo?.()
  const rawAddress = tabInfo?.tab?.navigation?.address ?? addressOf(props)
  const params = mergePaneParams(rawAddress, tabInfo?.tab?.navigation?.params ?? navigationOf(props))
  if (typeof params.title === 'string' && params.title) return <span>{params.title}</span>
  const stored = recallPaneTitle(rawAddress)
  if (stored) return <span>{stored}</span>
  const address = parseAddress(rawAddress)
  if (address?.kind === 'dataset') return <span>查询结果</span>
  if (address?.kind === 'confirm') return <span>确认</span>
  return <span>企业数据</span>
}
