import test from 'node:test'
import assert from 'node:assert/strict'
import { CardApi, CardApiError } from '../src/client/cards/api.js'
import {
  formatCell, paramsFromFields, parseAddress, parseCard, toolText,
} from '../src/client/cards/parse.js'

test('parseCard finds the card JSON after a human line', () => {
  const text = '已查询「查物料」：共 40 条。\n{"eais":"card/v1","kind":"dataset","total":40}'
  const card = parseCard(text)
  assert.equal(card?.kind, 'dataset')
  if (card?.kind === 'dataset') assert.equal(card.total, 40)
})

test('parseCard ignores tool text without a card payload', () => {
  assert.equal(parseCard('plain text'), undefined)
  assert.equal(parseCard('{"error":{"code":"E_POLICY"}}'), undefined)
})

test('toolText joins text content blocks', () => {
  assert.equal(toolText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'a\nb')
  assert.equal(toolText({ content: [] }), '')
})

test('formatCell follows the column type and enum mapping', () => {
  assert.equal(formatCell({ key: 'qty', label: '数量', type: 'number', unit: '个' }, 3), '3 个')
  assert.equal(formatCell({ key: 'ok', label: '启用', type: 'boolean' }, true), '正常')
  assert.equal(formatCell({
    key: 'level', label: '等级', type: 'enum',
    enum: [{ value: 'A', label: '甲级' }],
  }, 'A'), '甲级')
  assert.equal(formatCell({ key: 'name', label: '名称', type: 'string' }, null), '—')
})

test('paramsFromFields rebuilds nested objects and coerces numbers', () => {
  const params = paramsFromFields([
    { name: 'customer_no', label: '客户号', type: 'string', required: true },
    { name: 'contact.phone', label: '电话', type: 'string', required: false },
    { name: 'limit', label: '数量', type: 'integer', required: false },
  ], { customer_no: 'C0017', 'contact.phone': '123', limit: '5' })
  assert.deepEqual(params, { customer_no: 'C0017', contact: { phone: '123' }, limit: 5 })
})

test('parseAddress accepts only the two card kinds', () => {
  assert.deepEqual(parseAddress('dsh-resource://eais/dataset/v_1'), { kind: 'dataset', id: 'v_1' })
  assert.deepEqual(parseAddress('dsh-resource://eais/confirm/cf_1'), { kind: 'confirm', id: 'cf_1' })
  assert.equal(parseAddress('dsh-resource://eais/unknown/x'), undefined)
})

test('CardApi adds the staff card and maps an error body', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify({ error: { code: 'E_STALE', message: '结果已过期' } }), {
      status: 409, headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  const api = new CardApi({
    serverUrl: 'http://127.0.0.1:18080/',
    resolveToken: async () => 'card-token',
    fetchImpl,
  })
  await assert.rejects(() => api.rows('v_1', { limit: 10 }), (error: unknown) => {
    assert.ok(error instanceof CardApiError)
    assert.equal(error.code, 'E_STALE')
    assert.equal(error.status, 409)
    return true
  })
  assert.equal(calls[0]?.url, 'http://127.0.0.1:18080/views/v_1/rows')
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, 'Bearer card-token')
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    offset: 0, limit: 10, sort: '', desc: false, filter: '',
  })
})
