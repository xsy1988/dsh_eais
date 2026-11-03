import test from 'node:test'
import assert from 'node:assert/strict'
import {
  columnRole, layoutWidths, orderColumns, pageWindow, statusTone,
} from '../src/client/cards/design.js'
import { booleanText, formatCell } from '../src/client/cards/parse.js'
import { moveKey, mergeOrder } from '../src/client/cards/tableState.js'
import { pickAssistantTarget, pickFirstReply } from '../src/client/cards/anchor.js'
import type { CardColumn } from '../src/client/cards/types.js'

const columns: CardColumn[] = [
  { key: 'qty', label: '数量', type: 'number' },
  { key: 'name', label: '名称', type: 'string' },
  { key: 'code', label: '编码', type: 'string' },
  { key: 'status', label: '状态', type: 'string', enum: [{ value: 'active', label: '启用' }] },
  { key: 'remark', label: '备注', type: 'string' },
]

test('columns put code first, name second, then the server display order', () => {
  const ordered = orderColumns(columns, ['status', 'code', 'name'])
  assert.deepEqual(ordered.map((column) => column.key), ['code', 'name', 'status', 'qty', 'remark'])
  assert.equal(columnRole(ordered[0]!), 'code')
  assert.equal(columnRole(ordered[1]!), 'name')
})

test('layoutWidths respects min, max and horizontal overflow', () => {
  const wide = layoutWidths(columns, 4000)
  for (const [index, column] of columns.entries()) {
    const width = wide[index]!
    const role = columnRole(column)
    const bounds: Record<string, [number, number]> = {
      code: [110, 220], name: [160, 320], status: [96, 140],
      number: [96, 160], date: [140, 180], object: [200, 420], text: [160, 360],
    }
    const [min, max] = bounds[role]!
    assert.ok(width >= min && width <= max, `${column.key}=${width}`)
  }
  const narrow = layoutWidths(columns, 320)
  assert.ok(narrow.reduce((sum, value) => sum + value, 0) > 320)
})

test('pageWindow keeps the first and last page with an ellipsis', () => {
  assert.deepEqual(pageWindow(1, 10), [1, 2, 3, 4, 'ellipsis', 10])
  assert.deepEqual(pageWindow(5, 10), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
  assert.deepEqual(pageWindow(10, 10), [1, 'ellipsis', 7, 8, 9, 10])
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3])
})

test('status tones and boolean cell text are stable', () => {
  assert.equal(statusTone('启用'), 'success')
  assert.equal(statusTone('停用'), 'danger')
  assert.equal(statusTone('待确认'), 'warning')
  assert.equal(statusTone('电子'), 'neutral')
  assert.equal(formatCell({ key: 'enabled', label: '启停状态', type: 'string' }, 'true'), '正常')
  assert.equal(formatCell({ key: 'enabled', label: '启停状态', type: 'string' }, false), '关闭')
  assert.equal(formatCell({ key: 'approved', label: '是否通过', type: 'boolean' }, true), '是')
  assert.equal(formatCell({ key: 'approved', label: '是否通过', type: 'boolean' }, false), '否')
  assert.equal(booleanText('状态', 'true'), '正常')
  assert.equal(booleanText('状态', false), '关闭')
})

test('saved column order keeps known keys and appends new columns', () => {
  assert.deepEqual(mergeOrder(['name', 'code'], ['code', 'name', 'qty']), ['name', 'code', 'qty'])
  assert.deepEqual(mergeOrder(['gone', 'code'], ['code', 'name']), ['code', 'name'])
  assert.deepEqual(moveKey(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(moveKey(['a', 'b'], 0, 9), ['a', 'b'])
})

test('card anchor prefers the folded answer, then a visible response', () => {
  const element = (attributes: Record<string, string>) => ({
    getAttribute: (name: string) => attributes[name] ?? null,
    hasAttribute: (name: string) => name in attributes,
  }) as unknown as Element
  const items = [
    element({ 'data-chat-turn': '2', 'data-chat-flow-kind': 'assistant', 'data-turn-process-answer': 'true' }),
    element({ 'data-chat-turn': '2', 'data-chat-group-part': 'response' }),
    element({ 'data-chat-turn': '2', 'data-chat-flow-kind': 'assistant', 'data-turn-process-hidden': 'true' }),
    element({ 'data-chat-turn': '1', 'data-chat-flow-kind': 'assistant' }),
  ]
  assert.equal(pickAssistantTarget(items, '2'), items[0])
  assert.equal(pickAssistantTarget(items, '1'), items[3])
  assert.equal(pickAssistantTarget(items, '9'), undefined)

  const fallback = [
    element({ 'data-chat-turn': '4', 'data-chat-flow-kind': 'user' }),
    element({ 'data-chat-turn': '4', 'data-chat-flow-kind': 'turn-process' }),
    element({ 'data-chat-turn': '4', 'data-chat-flow-kind': 'assistant', 'data-turn-process-hidden': 'true' }),
  ]
  assert.equal(pickFirstReply(fallback, '4'), fallback[1])
})
