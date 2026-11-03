import { toolText } from './parse.js'

interface TurnCardState {
  turn: number
  texts: string[]
}

// eais-cards collects the card payloads of one turn so the chat can render them
// after the assistant's closing text, outside the collapsed tool process.
export const eaisCardsDefinition = {
  kind: 'eais-cards',
  match: (event: any) => {
    if (event?.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event?.type === 'tool/result') return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start: (_context: unknown, match: any): TurnCardState => ({
    turn: match.event.data.turn,
    texts: [],
  }),
  update: (context: any, match: any): TurnCardState => {
    if (match.event.type !== 'tool/result') return context.state
    const text = toolText(match.event.data?.message?.content)
    if (!text || context.state.texts.includes(text)) return context.state
    return { ...context.state, texts: [...context.state.texts, text] }
  },
  buildLocationData: (context: any, scope: string, previous: any) => {
    if (scope !== 'turn' || !context.state) return null
    if (previous?.kind === 'turn' && previous.turn === context.state.turn && previous.key === 'eais-cards') {
      return previous
    }
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'eais-cards',
      value: { texts: context.state.texts },
    }
  },
}
