import { useEffect, useMemo, useRef, useState } from 'react'
import type { CardApi } from './api.js'
import type { CardColumn } from './types.js'
import { countText, orderColumns } from './design.js'
import type { Density } from './tableState.js'
import { clearPrefs, mergeOrder, readPrefs, writePrefs } from './tableState.js'
import { PageShell } from './PageShell.js'
import { EmptyState } from './EmptyState.js'
import { TableToolbar } from './TableToolbar.js'
import { TableView } from './TableView.js'
import { Pagination } from './Pagination.js'
import { RecordDetail } from './RecordDetail.js'
import { Button } from './ui.js'

export interface DataSetPageProps {
  api: CardApi
  viewId: string
  title?: string
  action?: string
  initialColumns?: CardColumn[]
  initialDisplay?: string[]
  initialTotal?: number
  initialReturned?: number
  initialComplete?: boolean
  token?: string
}

export function DataSetPage({
  api, viewId, title, action, initialColumns, initialDisplay,
  initialTotal, initialReturned, initialComplete, token,
}: DataSetPageProps) {
  const actionKey = useRef(action || title || 'view').current
  const prefs = useRef(readPrefs(actionKey)).current
  const [columns, setColumns] = useState<CardColumn[]>(initialColumns ?? [])
  const [order, setOrder] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>(prefs.hidden ?? [])
  const [density, setDensity] = useState<Density>(prefs.density ?? 'standard')
  const [pageSize, setPageSize] = useState(prefs.pageSize ?? 50)
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState('')
  const [desc, setDesc] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [matched, setMatched] = useState(initialReturned ?? 0)
  const [complete, setComplete] = useState(initialComplete ?? false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<Record<string, unknown> | undefined>(undefined)
  const [actionName, setActionName] = useState(title)
  const [cursor, setCursor] = useState('')
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState('')
  const [sourceMode, setSourceMode] = useState<'task' | 'cursor'>('task')
  const [exportJob, setExportJob] = useState('')
  const [exportState, setExportState] = useState('')
  const [fileId, setFileId] = useState('')
  const [exportError, setExportError] = useState('')
  const appliedSignature = useRef('')

  const defaults = useMemo(
    () => orderColumns(columns, initialDisplay).map((column) => column.key),
    [columns, initialDisplay],
  )

  useEffect(() => {
    if (defaults.length === 0) return
    const signature = defaults.join('|')
    if (signature === appliedSignature.current) return
    appliedSignature.current = signature
    setOrder((current) => mergeOrder(current.length > 0 ? current : prefs.order, defaults))
  }, [defaults, prefs.order])

  useEffect(() => {
    if (order.length === 0) return
    writePrefs(actionKey, { order, hidden, density, pageSize })
  }, [actionKey, order, hidden, density, pageSize])

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim()
      if (next === filter) return
      setFilter(next)
      setOffset(0)
    }, 250)
    return () => clearTimeout(timer)
  }, [search, filter])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(undefined)
    api.rows(viewId, { offset, cursor, limit: pageSize, sort, desc, filter }, token)
      .then((page) => {
        if (cancelled) return
        setRows(page.rows ?? [])
        setNextCursor(page.next_cursor ?? '')
        setSourceMode(page.source_mode === 'cursor' ? 'cursor' : 'task')
        const nextColumns = (page.columns as CardColumn[] | undefined) ?? []
        if (nextColumns.length > 0) setColumns(nextColumns)
        setTotal(page.total ?? 0)
        setMatched(page.matched ?? 0)
        setComplete(page.complete === true)
        if (page.action_name) setActionName(page.action_name)
        else if (page.title) setActionName((current) => current || page.title)
      })
      .catch((failure: Error) => {
        if (!cancelled) setError(failure.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [api, viewId, offset, cursor, pageSize, sort, desc, filter, token, reload])

  useEffect(() => {
    if (sourceMode === 'cursor' || matched <= 0 || offset < matched) return
    const last = Math.max(0, Math.floor((matched - 1) / pageSize) * pageSize)
    if (last !== offset) setOffset(last)
  }, [matched, offset, pageSize, sourceMode])

  useEffect(() => {
    setCursor('')
    setCursorHistory([])
  }, [pageSize, sort, desc, filter, reload, viewId])

  useEffect(() => {
    if (!exportJob) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const job = await api.job(exportJob)
        if (cancelled) return
        setExportState(job.state)
        setFileId(job.result.file_id ?? '')
        setExportError(job.result.error ?? '')
        if (job.state === 'submitted' || job.state === 'running') timer = setTimeout(() => void poll(), 1000)
      } catch (failure) {
        if (!cancelled) setExportError(failure instanceof Error ? failure.message : String(failure))
      }
    }
    void poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [api, exportJob])

  const nextPage = () => {
    if (!nextCursor) return
    setCursorHistory((current) => [...current, cursor])
    setCursor(nextCursor)
    setOffset((current) => current + pageSize)
  }
  const previousPage = () => {
    const previous = cursorHistory[cursorHistory.length - 1]
    if (previous === undefined) return
    setCursor(previous)
    setCursorHistory((current) => current.slice(0, -1))
    setOffset((current) => Math.max(0, current - pageSize))
  }
  const startExport = async () => {
    setExportError('')
    setFileId('')
    try {
      const job = await api.export(viewId, token)
      setExportJob(job.job_id)
      setExportState(job.state)
    } catch (failure) {
      setExportError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  const download = async () => {
    if (!fileId) return
    const blob = await api.download(fileId)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${actionName || 'dataset'}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const byKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns])
  const ordered = useMemo(
    () => order.map((key) => byKey.get(key)).filter((column): column is CardColumn => column !== undefined),
    [order, byKey],
  )
  const visible = useMemo(() => ordered.filter((column) => !hidden.includes(column.key)), [ordered, hidden])
  const name = actionName || title || '查询结果'
  const subtitle = [
    `共 ${countText(total)} 条`,
    matched !== total ? `筛选后 ${countText(matched)} 条` : '',
    complete ? '' : '已截断',
  ].filter(Boolean).join(' · ')

  const clearFilter = () => {
    setSearch('')
    setFilter('')
    setOffset(0)
  }
  const reset = () => {
    clearPrefs(actionKey)
    setOrder(defaults)
    setHidden([])
    setDensity('standard')
    setPageSize(50)
    setOffset(0)
    setSort('')
    setDesc(false)
    setSearch('')
    setFilter('')
  }
  const toggleSort = (key: string) => {
    if (sourceMode === 'cursor') {
      setError('该接口未声明全局排序下推')
      return
    }
    if (sort !== key) {
      setSort(key)
      setDesc(false)
    } else if (!desc) {
      setDesc(true)
    } else {
      setSort('')
      setDesc(false)
    }
    setOffset(0)
  }

  if (selected) {
    return (
      <RecordDetail
        columns={ordered}
        row={selected}
        actionName={name}
        onBack={() => setSelected(undefined)}
      />
    )
  }

  return (
    <PageShell
      title={name}
      subtitle={subtitle}
      bodyScroll={false}
      trailing={sourceMode === 'cursor' ? (
        <>
          {fileId ? <Button variant="primary" size="sm" onClick={() => { void download().catch((failure: Error) => setExportError(failure.message)) }}>下载 CSV</Button> : (
            <Button size="sm" disabled={exportState === 'submitted' || exportState === 'running'} onClick={() => void startExport()}>
              {exportState === 'submitted' || exportState === 'running' ? '正在导出' : '导出'}
            </Button>
          )}
        </>
      ) : undefined}
      footer={(
        <Pagination
          offset={offset}
          limit={pageSize}
          matched={matched}
          total={total}
          onOffsetChange={setOffset}
          onLimitChange={(limit) => { setPageSize(limit); setOffset(0) }}
          cursorMode={sourceMode === 'cursor'}
          canNext={Boolean(nextCursor)}
          onPreviousCursor={previousPage}
          onNextCursor={nextPage}
        />
      )}
    >
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={() => { setFilter(search.trim()); setOffset(0) }}
        onClear={clearFilter}
        filterActive={filter !== ''}
        density={density}
        onDensityChange={setDensity}
        columns={ordered}
        order={order}
        hidden={hidden}
        onHiddenChange={setHidden}
        onOrderChange={setOrder}
        onReset={reset}
        onRefresh={() => setReload((value) => value + 1)}
        refreshing={loading}
      />
      <div style={{ height: 2, flex: 'none', background: loading ? 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 35%, transparent)' : 'transparent' }} />
      {exportError ? <p role="alert" style={{ margin: 0, color: 'var(--dsw-alias-state-error-primary)' }}>{exportError}</p> : null}
      {loading && rows.length === 0 && !error ? (
        <div style={{ ...loadingStyle, flex: 'auto' }}>正在读取数据…</div>
      ) : error ? (
        <div style={stateWrapStyle}>
          <EmptyState
            danger
            title="读取失败"
            description={error}
            action={<Button variant="primary" size="sm" onClick={() => setReload((value) => value + 1)}>重试</Button>}
          />
        </div>
      ) : visible.length === 0 ? (
        <div style={stateWrapStyle}>
          <EmptyState title="没有可显示的列" description="在列设置里至少保留一列。" />
        </div>
      ) : matched === 0 ? (
        <div style={stateWrapStyle}>
          <EmptyState
            title={filter ? '没有匹配的数据' : '暂无数据'}
            description={filter ? '换个关键词，或清除筛选后再看。' : '这次查询没有返回记录。'}
            action={filter
              ? <Button variant="ghost" size="sm" onClick={clearFilter}>清除筛选</Button>
              : <Button variant="ghost" size="sm" onClick={() => setReload((value) => value + 1)}>刷新</Button>}
          />
        </div>
      ) : (
        <TableView
          columns={visible}
          rows={rows}
          density={density}
          sort={sort}
          desc={desc}
          onSort={toggleSort}
          onRowClick={setSelected}
        />
      )}
    </PageShell>
  )
}

const stateWrapStyle = {
  flex: 'auto',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  minHeight: 0,
} as const

const loadingStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 180,
  font: 'var(--dsw-font-xs-13)',
  color: 'var(--dsw-alias-label-tertiary)',
} as const
