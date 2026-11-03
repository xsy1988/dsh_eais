import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'

let warned = false

// DSH 0.2.1-rc.3 conversation contract, used only here:
//   [data-slot="conversation.chat.flow"]           the turn flow container
//     [data-chat-turn="N"]                         one flow item of turn N
//       [data-turn-process-answer]                 folded-group closing answer
//       [data-chat-group-part="response"]          expanded-group closing answer
//       [data-chat-flow-kind="assistant"]          ordinary closing answer
//       [data-chat-flow-kind="turn-tail"]          the slot we are mounted in
// The card lives in this React tree and is moved with insertBefore, so React
// keeps updating the same DOM node while the user sees it before the answer.
// Missing anchors leave the card at the turn tail.
export interface CardPlacementProps {
  turn?: number
  cardKey: string
  children: ReactNode
}

export function CardPlacement({ turn, cardKey, children }: CardPlacementProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const card = cardRef.current
    if (!anchor || !card || turn === undefined) return
    let frame = 0

    const inline = () => {
      anchor.setAttribute('data-eais-card-placement', 'inline')
      card.style.margin = '12px 0 0'
      if (card.parentElement !== anchor) anchor.appendChild(card)
    }

    const position = () => {
      const currentAnchor = anchorRef.current
      const currentCard = cardRef.current
      if (!currentAnchor || !currentCard) return
      const flow = findFlow(currentAnchor, String(turn))
      if (!flow) {
        warnOnce('conversation.chat.flow not found; the card stays at the turn tail')
        inline()
        return
      }
      const ownItem = currentAnchor.closest('[data-chat-flow-kind="turn-tail"]')
      const items = Array.from(flow.querySelectorAll('[data-chat-turn]'))
      const target = pickAssistantTarget(items, String(turn))
        ?? pickFirstReply(items, String(turn))
        ?? ownItem
        ?? undefined
      const container = target?.parentElement
      if (!target || !container) {
        inline()
        return
      }
      currentAnchor.setAttribute('data-eais-card-placement', 'flow')
      currentCard.style.margin = '12px 0 8px'
      if (currentCard.parentElement !== container || currentCard.nextSibling !== target) {
        container.insertBefore(currentCard, target)
      }
    }

    const schedule = () => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        try {
          position()
        } catch (error) {
          warnOnce(`card anchor failed: ${String(error)}`)
          inline()
        }
      })
    }

    try {
      position()
    } catch (error) {
      warnOnce(`card anchor failed: ${String(error)}`)
      inline()
    }
    // The host may replace the flow container itself when a turn settles, so
    // observe the stable scroll root and re-find the flow on every mutation.
    const root = anchor.closest('[data-conversation-scroll]') ?? document.body
    const observer = new MutationObserver(schedule)
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributeFilter: ['data-chat-flow-kind', 'data-chat-turn', 'data-turn-process-answer', 'data-chat-group-part', 'hidden'],
    })
    return () => {
      observer?.disconnect()
      if (frame !== 0) window.cancelAnimationFrame(frame)
      if (anchor.isConnected) inline()
    }
  }, [turn, cardKey])

  return (
    <div
      ref={anchorRef}
      data-eais-card-anchor=""
      data-eais-card-placement="pending"
      style={{ display: 'block', height: 0, minHeight: 0 }}
    >
      <div ref={cardRef} data-eais-card-slot="" style={{ minWidth: 0, marginTop: 12 }}>
        {children}
      </div>
    </div>
  )
}

export function findFlow(anchor: Element, turn: string): Element | undefined {
  const direct = anchor.closest('[data-slot="conversation.chat.flow"]')
  if (direct) return direct
  // Keep working if the host drops the data-slot marker: the first ancestor
  // that actually owns flow items is the container we need.
  let node = anchor.parentElement
  while (node) {
    if (node.querySelector('[data-chat-turn]')) return node
    node = node.parentElement
  }
  // Some slot seats render the turn tail as a sibling of the flow instead of a
  // descendant. Search the same scroll surface for the flow that owns this turn.
  const scope = anchor.closest('[data-conversation-scroll]') ?? anchor.ownerDocument
  const flows = Array.from(scope.querySelectorAll('[data-slot="conversation.chat.flow"]'))
  return flows.find((flow) => flow.querySelector(`[data-chat-turn="${turn}"]`)) ?? flows[0]
}

export function pickFirstReply(items: Element[], turn: string): Element | undefined {
  return items.find((item) => {
    if (item.getAttribute('data-chat-turn') !== turn) return false
    if (item.hasAttribute('data-turn-process-hidden')) return false
    const kind = item.getAttribute('data-chat-flow-kind')
    return kind !== 'user' && kind !== 'input'
  })
}

export function pickAssistantTarget(items: Element[], turn: string): Element | undefined {
  const own = items.filter((item) => item.getAttribute('data-chat-turn') === turn)
  // The folded process group exposes the closing answer through this marker.
  const compact = [...own].reverse().find((item) => item.hasAttribute('data-turn-process-answer'))
  if (compact) return compact
  const response = [...own].reverse().find((item) => item.getAttribute('data-chat-group-part') === 'response'
    && !item.hasAttribute('data-turn-process-hidden'))
  if (response) return response
  return [...own].reverse().find((item) => item.getAttribute('data-chat-flow-kind') === 'assistant'
    && !item.hasAttribute('data-turn-process-hidden'))
}

function warnOnce(message: string): void {
  if (warned) return
  warned = true
  console.warn(`[eais] ${message}`)
}
