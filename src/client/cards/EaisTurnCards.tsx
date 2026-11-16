import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { CardApi } from './api.js'
import type { OpenResource } from './ResultCard.js'
import { ConfirmCard } from './ConfirmCard.js'
import { ResultCard } from './ResultCard.js'
import { CardPlacement } from './anchor.js'
import { selectTurnCard, type TurnCardEntry } from './select.js'
import { PluginTurnCard, selectPluginCard } from '../PluginCards.js'
import type { ClientContext } from '../../port.js'

type SnapshotHook = (selector: (snapshot: any) => unknown) => unknown

export interface EaisTurnCardsProps {
  props?: unknown
  ctx?: ClientContext
  fetchImpl?: typeof fetch
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

function TurnCard({ props, ctx, fetchImpl, api, openResource, useChat }: EaisTurnCardsProps & { useChat: SnapshotHook }) {
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
  const pluginCard = selectPluginCard(entries)
  if (pluginCard && ctx) {
    return createElement(CardPlacement, {
      turn, cardKey: `plugin:${pluginCard.kind}`,
      children: createElement(PluginTurnCard, { card: pluginCard, ctx, props, openResource, fetchImpl }),
    })
  }
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
