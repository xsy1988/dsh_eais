import test from 'node:test'
import assert from 'node:assert/strict'
import { EaisDataService, registerEaisData } from '../src/client/data.js'
import { queryEaisData } from '../src/dataProxy.js'

test('eaisData calls the same-origin Host proxy without exposing the card token', async () => {
  const calls: Array<{ input: string, init?: RequestInit }> = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init })
    return new Response(JSON.stringify({
      task_id: 'task-1',
      action: 'customer.search',
      columns: [],
      rows: [],
      total: 0,
      truncated: false,
      delivery: 'inline',
    }), { status: 200 })
  }
  const service = new EaisDataService('@local/demo', {
    endpoint: 'http://dsh/eais/data/query',
    fetchImpl: fetchImpl as never,
  })
  const result = await service.call({ code: 'customer.search', params: { query: 'x' }, detail: 'auto' })
  assert.equal(result.task_id, 'task-1')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.input, 'http://dsh/eais/data/query')
  const headers = calls[0]!.init?.headers as Record<string, string>
  assert.equal(headers.authorization, undefined)
  const body = JSON.parse(String(calls[0]!.init?.body)) as Record<string, unknown>
  assert.equal(body.packageName, '@local/demo')
  assert.equal(body.code, 'customer.search')
  assert.deepEqual(body.params, { query: 'x' })
  assert.equal(body.detail, 'auto')
})

test('eaisData reads the plugin name from the Cordis loader entry', async () => {
  let listener: ((ctx: unknown, name: string, error: unknown, next: () => unknown) => unknown) | undefined
  const bodies: Array<Record<string, unknown>> = []
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({
      task_id: 'task-1', action: 'customer.search', columns: [], rows: [], total: 0, truncated: false, delivery: 'inline',
    }), { status: 200 })
  }
  registerEaisData({ on: (_event, handler) => { listener = handler } }, {
    endpoint: 'http://dsh/eais/data/query',
    fetchImpl: fetchImpl as never,
  })
  const pluginCtx = {
    get name(): string {
      throw new Error('cannot get property "name" without inject')
    },
    fiber: { name: 'Gb', entry: { options: { name: '@local/demo' } } },
  }
  const service = listener!(pluginCtx, 'eaisData', undefined, () => undefined) as EaisDataService
  const result = await service.call({ code: 'customer.search', params: {}, detail: 'auto' })
  assert.equal(result.task_id, 'task-1')
  assert.equal(bodies[0]!.packageName, '@local/demo')
})

test('host data proxy resolves the plugin number and forwards the query', async () => {
  const calls: Array<{ input: string, init?: RequestInit }> = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init })
    if (String(input).includes('/plugins/resolve')) {
      return new Response(JSON.stringify({ pluginNo: 'PN-2026-0009' }), { status: 200 })
    }
    return new Response(JSON.stringify({ task_id: 'task-1', action: 'customer.search', rows: [], columns: [], total: 0, truncated: false, delivery: 'inline' }), { status: 200 })
  }
  const result = await queryEaisData(
    { serverUrl: 'http://edge', token: 'token' },
    '@local/demo',
    { code: 'customer.search', params: { query: 'x' } },
    fetchImpl as never,
  )
  assert.equal(result.status, 200)
  assert.equal(result.pluginNumber, 'PN-2026-0009')
  assert.equal(calls.length, 2)
  assert.ok(calls[0]!.input.includes(encodeURIComponent('@local/demo')))
  const resolveHeaders = calls[0]!.init?.headers as Record<string, string>
  assert.equal(resolveHeaders.authorization, 'Bearer token')
  assert.equal(calls[1]!.input, 'http://edge/data/query')
  const queryHeaders = calls[1]!.init?.headers as Record<string, string>
  assert.equal(queryHeaders.authorization, 'Bearer token')
  assert.equal(queryHeaders['x-eais-plugin'], 'PN-2026-0009')
  const body = JSON.parse(String(calls[1]!.init?.body)) as Record<string, unknown>
  assert.equal(body.code, 'customer.search')
  assert.deepEqual(body.params, { query: 'x' })
})
