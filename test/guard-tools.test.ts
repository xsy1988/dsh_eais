import test from 'node:test'
import assert from 'node:assert/strict'
import { ToolPolicyController } from '../src/guard/tools.js'

const names = ['read', 'write', 'bash', 'web_search', 'mcp__eais__scope', 'mcp__eais__evil']

function agentFor(calls: Array<{ allow?: string[]; deny?: string[] }>, disposals: number[], visible: () => string[]) {
  const registry = {
    restrict(filter: { allow?: string[]; deny?: string[] }) {
      calls.push(filter)
      return () => disposals.push(1)
    },
    schemas: () => visible().map((name) => ({ name })),
  }
  return {
    ctx: {
      inject(_names: string[], callback: (ctx: { tools: typeof registry }) => void) {
        callback({ tools: registry })
        return { dispose: () => disposals.push(0) }
      },
    },
  }
}

test('controller asks the server for the allowed names and denies the rest', async () => {
  const calls: Array<{ allow?: string[]; deny?: string[] }> = []
  const disposals: number[] = []
  const listeners = new Map<string, (payload: any) => unknown>()
  let requested: string[] = []
  const visible = () => names
  const policy = { revision: 'rev-1', source: 'live', allowedTools: ['read', 'mcp__eais__scope'] }
  const controller = new ToolPolicyController({
    credentials: { resolve: () => 'token' },
    on: (event, listener) => listeners.set(event, listener),
  }, {}, {
    fetchImpl: async (input, init) => {
      if (!String(input).endsWith('/software/tool-filter')) {
        return new Response('{}', { status: 200 })
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as { names?: string[] }
      requested = body.names ?? []
      return new Response(JSON.stringify(policy), { status: 200 })
    },
    intervalMs: 60_000,
  })
  await controller.start()
  try {
    listeners.get('agent/created')?.({ agent: agentFor(calls, disposals, visible) })
    await controller.refresh()

      assert.ok(requested.includes('read'))
    assert.ok(requested.includes('bash'))
    assert.equal(calls.length, 1)
    // The mask is stated as `deny`: the controller only sees the global layer, so
    // an allow list would hide every preset-registered tool.
    assert.equal(calls[0]!.allow, undefined)
    assert.ok(calls[0]!.deny?.includes('write'))
    assert.ok(calls[0]!.deny?.includes('bash'))
    assert.ok(calls[0]!.deny?.includes('mcp__eais__evil'))
    assert.ok(!calls[0]!.deny?.includes('read'))
    assert.ok(!calls[0]!.deny?.includes('mcp__eais__scope'))

    names.push('glob')
    await controller.refresh()
    assert.equal(calls.length, 2)
    assert.equal(disposals.length, 1)
    assert.ok(calls[1]!.deny?.includes('glob'))
  } finally {
    controller.stop()
  }
  assert.equal(disposals.length, 3)
})

test('a failed fetch keeps the previous restriction instead of opening up', async () => {
  const calls: Array<{ allow?: string[]; deny?: string[] }> = []
  const disposals: number[] = []
  const listeners = new Map<string, (payload: any) => unknown>()
  let fail = false
  const controller = new ToolPolicyController({
    credentials: { resolve: () => 'token' },
    on: (event, listener) => listeners.set(event, listener),
  }, {}, {
    fetchImpl: async (input) => {
      if (!String(input).endsWith('/software/tool-filter')) {
        return new Response('{}', { status: 200 })
      }
      if (fail) return new Response('{}', { status: 503 })
      return new Response(JSON.stringify({ revision: 'r', allowedTools: ['read'] }), { status: 200 })
    },
    intervalMs: 60_000,
  })
  await controller.start()
  try {
    listeners.get('agent/created')?.({ agent: agentFor(calls, disposals, () => names) })
    await controller.refresh()
    assert.ok(calls[0]!.deny?.includes('bash'))
    fail = true
    await controller.refresh()
    assert.equal(calls.length, 1, 'a failed refresh must not rebuild the mask')
  } finally {
    controller.stop()
  }
})

test('controller survives an inactive settings context during plugin reload', async () => {
  const context = {
    credentials: { resolve: () => 'token' },
    get settingsController(): never {
      throw new Error('cannot get required service "settingsController" in inactive context')
    },
  }
  const controller = new ToolPolicyController(context, {}, {
    fetchImpl: async () => new Response(JSON.stringify({ allowedTools: [] }), { status: 200 }),
    intervalMs: 60_000,
  })
  await assert.doesNotReject(controller.refresh())
  controller.stop()
})

test('unloaded scoped tools cannot break mask replacement', async () => {
  const calls: Array<{ allow?: string[]; deny?: string[] }> = []
  const disposals: number[] = []
  const listeners = new Map<string, (payload: any) => unknown>()
  const registry = {
    restrict(filter: { allow?: string[]; deny?: string[] }) {
      calls.push(filter)
      if (calls.length === 1) throw new Error('tools.restrict() names unknown global tool "mcp__eais__plugin_submit"; known global tools: read')
      return () => disposals.push(1)
    },
    schemas: () => [{ name: 'read' }, { name: 'mcp__eais__plugin_submit' }],
  }
  const agent = {
    session: { id: 'session-unload' },
    ctx: { inject: (_names: string[], callback: (ctx: { tools: typeof registry }) => void) => {
      callback({ tools: registry })
      return { dispose: () => disposals.push(0) }
    } },
  }
  const controller = new ToolPolicyController({
    credentials: { resolve: () => 'token' },
    on: (event, listener) => listeners.set(event, listener),
  }, {}, {
    fetchImpl: async () => new Response(JSON.stringify({ allowedTools: ['read'] }), { status: 200 }),
    intervalMs: 60_000,
  })
  await controller.start()
  listeners.get('agent/created')?.({ agent })
  await controller.refresh()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1]!.deny, [])
  assert.equal(disposals.length, 0, 'the previous mask must survive until replacement succeeds')
  controller.stop()
})

test('new mask is created before the previous mask is disposed', async () => {
  const events: string[] = []
  const listeners = new Map<string, (payload: any) => unknown>()
  let visible = ['read', 'bash']
  const registry = {
    restrict(filter: { deny?: string[] }) {
      events.push('create:' + (filter.deny ?? []).join(','))
      return () => events.push('dispose')
    },
    schemas: () => visible.map(name => ({ name })),
  }
  const agent = {
    session: { id: 'session-order' },
    ctx: { inject: (_names: string[], callback: (ctx: { tools: typeof registry }) => void) => {
      callback({ tools: registry })
      return { dispose: () => undefined }
    } },
  }
  const controller = new ToolPolicyController({
    credentials: { resolve: () => 'token' },
    on: (event, listener) => listeners.set(event, listener),
  }, {}, {
    fetchImpl: async () => new Response(JSON.stringify({ allowedTools: ['read'] }), { status: 200 }),
    intervalMs: 60_000,
  })
  await controller.start()
  listeners.get('agent/created')?.({ agent })
  await controller.refresh()
  visible = ['read', 'bash', 'glob']
  await controller.refresh()
  assert.ok(events.indexOf('create:bash,glob') < events.indexOf('dispose'))
  controller.stop()
})
