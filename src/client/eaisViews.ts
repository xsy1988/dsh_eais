import { extractViewIds } from './Card.js'
import { collectText } from './EaisTurnCard.js'

interface TurnViewState {
  turn: number
  views: string[]
}

export const eaisViewsDefinition = {
  kind: 'eais-views',
  match: (event: any) => {
    if (event?.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event?.type === 'tool/result') return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start: (_context: unknown, match: any): TurnViewState => ({
    turn: match.event.data.turn,
    views: [],
  }),
  update: (context: any, match: any): TurnViewState => {
    if (match.event.type !== 'tool/result') return context.state
    const ids = extractViewIds(collectText(match.event.data?.message?.content))
    if (ids.length === 0) return context.state
    return {
      ...context.state,
      views: [...new Set([...context.state.views, ...ids])],
    }
  },
  buildLocationData: (context: any, scope: string, previous: any) => {
    if (scope !== 'turn' || !context.state) return null
    if (previous?.kind === 'turn' && previous.turn === context.state.turn && previous.key === 'eais-views') {
      return previous
    }
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'eais-views',
      value: { views: context.state.views },
    }
  },
}
