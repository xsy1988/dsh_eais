import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { CardApi } from './api.js'
import type { OpenResource } from './ResultCard.js'
import { ConfirmCard } from './ConfirmCard.js'
import { ResultCard } from './ResultCard.js'
import { CardPlacement } from './anchor.js'
import { selectTurnCard, type TurnCardEntry } from './select.js'

type SnapshotHook = (selector: (snapshot: any) => unknown) => unknown

export interface EaisTurnCardsProps {
  props?: unknown
  api?: CardApi
  openResource?: OpenResource
  useChat?: SnapshotHook
}

// EaisTurnCards renders at most one card per completed turn. It reads the
// turn's tool-call nodes from the Chat snapshot so it works for replayed turns.
export function EaisTurnCards({ useChat, ...rest }: EaisTurnCardsProps) {
  if (!useChat) return null
  return <TurnCard useChat={useChat} {...rest} />
}

function TurnCard({ props, api, openResource, useChat }: EaisTurnCardsProps & { useChat: SnapshotHook }) {
  const record = (props ?? {}) as Record<string, any>
  const turn = record.turn?.turn as number | undefined
  const data = (turn === undefined
    ? []
    : useChat((snapshot: any) => {
      const source = snapshot?.nodes?.turnDataSource?.(turn, 'tool-call')
      return source?.getSnapshot?.() ?? []
    }) ?? []) as Array<{ root?: { name?: string; content?: unknown[] } }>
  if (!api) return null
  const entries: TurnCardEntry[] = data.map((entry) => ({
    toolName: entry.root?.name ?? '',
    text: contentText(entry.root?.content),
  }))
  const card = selectTurnCard(entries)
  if (!card) return null
  const node: ReactNode = card.kind === 'draft'
    ? createElement(ConfirmCard, { card, api, openResource })
    : createElement(ResultCard, { card, api, openResource })
  const cardKey = card.kind === 'draft'
    ? `draft:${card.confirm_id}`
    : `dataset:${card.view_id ?? card.action}:${card.total}`
  return createElement(CardPlacement, { turn, cardKey, children: node })
}

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((entry) => (entry && typeof entry === 'object' && typeof (entry as { text?: unknown }).text === 'string'
      ? (entry as { text: string }).text
      : ''))
    .join('\n')
}
