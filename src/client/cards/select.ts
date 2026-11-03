import { parseCard } from './parse.js'
import type { CardPayload } from './types.js'

export interface TurnCardEntry {
  toolName: string
  text: string
}

// One turn shows one card: a write confirmation wins, a task-only follow-up
// shows none, otherwise the first read card is the user's main query.
export function selectTurnCard(entries: TurnCardEntry[]): CardPayload | undefined {
  const drafts: CardPayload[] = []
  const datasets: CardPayload[] = []
  let hasTask = false
  for (const entry of entries) {
    if (entry.toolName.endsWith('__task')) hasTask = true
    const card = parseCard(entry.text)
    if (!card) continue
    if (card.kind === 'draft') drafts.push(card)
    else if (card.kind === 'dataset') datasets.push(card)
  }
  if (drafts.length > 0) return drafts[drafts.length - 1]
  if (hasTask) return undefined
  return datasets[0]
}
