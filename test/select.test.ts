import test from 'node:test'
import assert from 'node:assert/strict'
import { selectTurnCard } from '../src/client/cards/select.js'

const dataset = (action: string) => JSON.stringify({ eais: 'card/v1', kind: 'dataset', action, total: 1 })
const draft = JSON.stringify({ eais: 'card/v1', kind: 'draft', confirm_id: 'cf_1', action: 'x' })

test('selectTurnCard prefers a draft over reads', () => {
  const card = selectTurnCard([
    { toolName: 'mcp__eais__submit', text: dataset('read') },
    { toolName: 'mcp__eais__draft', text: draft },
  ])
  assert.equal(card?.kind, 'draft')
})

test('selectTurnCard hides cards in a task-only follow-up turn', () => {
  const card = selectTurnCard([
    { toolName: 'mcp__eais__task', text: JSON.stringify({ task_id: 't1', status: 'completed' }) },
    { toolName: 'mcp__eais__submit', text: dataset('verify') },
  ])
  assert.equal(card, undefined)
})

test('selectTurnCard keeps the first read card of a multi-query turn', () => {
  const card = selectTurnCard([
    { toolName: 'mcp__eais__submit', text: dataset('material') },
    { toolName: 'mcp__eais__submit', text: dataset('bom') },
  ])
  assert.equal(card?.kind, 'dataset')
  if (card?.kind === 'dataset') assert.equal(card.action, 'material')
})

test('selectTurnCard ignores tool text without a card', () => {
  assert.equal(selectTurnCard([{ toolName: 'mcp__eais__scope', text: '{"scope":{}}' }]), undefined)
})
