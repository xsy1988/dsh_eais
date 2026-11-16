import test from 'node:test'
import assert from 'node:assert/strict'
import { PluginApi } from '../src/client/plugins/api.js'

test('plugin browser api uses host routes without reading credentials', async () => {
  const calls: Array<{ path: string, init?: RequestInit }> = []
  const api = new PluginApi({
    fetchImpl: async (path: string | URL | Request, init?: RequestInit) => {
      calls.push({ path: String(path), init })
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    },
  } as never)
  await api.list()
  await api.events('PN-2026-0001')
  await api.action('PN-2026-0001', 'open')
  assert.deepEqual(calls.map(call => call.path), [
    '/eais/plugins/mine',
    '/eais/plugins/events?pluginNo=PN-2026-0001',
    '/eais/plugins/action',
  ])
  for (const call of calls) assert.equal(call.init?.headers && new Headers(call.init.headers).has('authorization'), false)
})
