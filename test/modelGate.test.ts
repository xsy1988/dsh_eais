import test from 'node:test'
import assert from 'node:assert/strict'
import { installModelGate } from '../src/modelGate.js'

interface FakeSession {
  header?: { agentPreset?: unknown }
}

function fakeHost(options: {
  sessions?: Record<string, FakeSession>
  projected?: Record<string, string | null>
  defaultPreset?: string
}) {
  const listeners: Array<(...args: unknown[]) => unknown> = []
  const ctx = {
    on: (_event: string, listener: (...args: unknown[]) => void) => {
      listeners.push(listener)
      return () => undefined
    },
    get: (name: string) => {
      if (name === 'sessions') {
        return { get: (sessionId: string) => options.sessions?.[sessionId] }
      }
      if (name === 'sessionProjections') {
        return {
          stateOf: (session: FakeSession, key: string) =>
            key === 'agentPreset' ? options.projected?.[JSON.stringify(session)] : undefined,
        }
      }
      if (name === 'agentPresets') return { defaultId: options.defaultPreset }
      return undefined
    },
  }
  const stream = (options: { provider: string; sessionId?: string }) => {
    const listener = listeners[0]
    if (listener === undefined) throw new Error('model gate listener was not registered')
    let called = false
    const next = async function* () {
      called = true
      yield { type: 'text', text: 'downstream' }
    }
    const result = listener(options, next) as AsyncIterable<unknown>
    return { result, called: () => called }
  }
  return { ctx, stream }
}

async function firstChunk(stream: AsyncIterable<unknown>) {
  for await (const chunk of stream) return chunk as Record<string, unknown>
  return undefined
}

test('enterprise preset may call the EAIS provider', async () => {
  const session = { header: { agentPreset: 'eais-chat' } }
  const host = fakeHost({ sessions: { s1: session }, projected: { [JSON.stringify(session)]: 'eais-chat' } })
  installModelGate(host.ctx as never, {
    enterprisePresets: ['eais-chat'],
    enterpriseProviders: ['eais'],
  })
  const { result, called } = host.stream({ provider: 'eais', sessionId: 's1' })
  assert.equal((await firstChunk(result) as Record<string, unknown>).type, 'text')
  assert.equal(called(), true)
})

test('enterprise preset may not call another provider', async () => {
  const session = { header: { agentPreset: 'eais-chat' } }
  const host = fakeHost({ sessions: { s1: session }, projected: { [JSON.stringify(session)]: 'eais-chat' } })
  installModelGate(host.ctx as never, {
    enterprisePresets: ['eais-chat'],
    enterpriseProviders: ['eais'],
  })
  const { result, called } = host.stream({ provider: 'deepseek', sessionId: 's1' })
  const chunk = await firstChunk(result) as Record<string, any>
  assert.equal(chunk.type, 'finish')
  assert.equal(chunk.reason.kind, 'error')
  assert.equal(chunk.reason.failure.code, 'E_POLICY')
  assert.match(String(chunk.reason.failure.message), /企业模式/)
  assert.equal(called(), false)
})

test('another preset may not call the EAIS provider', async () => {
  const session = { header: { agentPreset: 'cordis' } }
  const host = fakeHost({ sessions: { s1: session }, projected: { [JSON.stringify(session)]: 'cordis' } })
  installModelGate(host.ctx as never, {
    enterprisePresets: ['eais-chat'],
    enterpriseProviders: ['eais'],
  })
  const { result, called } = host.stream({ provider: 'eais', sessionId: 's1' })
  const chunk = await firstChunk(result) as Record<string, any>
  assert.equal(chunk.type, 'finish')
  assert.equal(chunk.reason.failure.code, 'E_POLICY')
  assert.equal(called(), false)
})

test('another preset may call another provider', async () => {
  const session = { header: { agentPreset: 'cordis' } }
  const host = fakeHost({ sessions: { s1: session }, projected: { [JSON.stringify(session)]: 'cordis' } })
  installModelGate(host.ctx as never, {
    enterprisePresets: ['eais-chat'],
    enterpriseProviders: ['eais'],
  })
  const { result, called } = host.stream({ provider: 'deepseek', sessionId: 's1' })
  assert.equal((await firstChunk(result) as Record<string, unknown>).type, 'text')
  assert.equal(called(), true)
})

test('a session without a recorded preset falls back to the registry default', async () => {
  const session = { header: {} }
  const host = fakeHost({ sessions: { s1: session }, projected: { [JSON.stringify(session)]: null }, defaultPreset: 'eais-chat' })
  installModelGate(host.ctx as never, {
    enterprisePresets: ['eais-chat'],
    enterpriseProviders: ['eais'],
  })
  const blocked = host.stream({ provider: 'deepseek', sessionId: 's1' })
  assert.equal((await firstChunk(blocked.result) as Record<string, any>).type, 'finish')
  assert.equal(blocked.called(), false)
})
