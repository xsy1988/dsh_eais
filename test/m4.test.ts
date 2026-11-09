import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMe, type FetchLike } from '../src/api.js'
import { EaisAdapter, type EaisRuntimeSession } from '../src/adapter/index.js'
import { toOpenAIMessages } from '../src/adapter/messages.js'
import { readOpenAIStream } from '../src/adapter/stream.js'
import {
  EAIS_TOKEN_REF,
  EaisError,
  initialPublicState,
  type EaisMe,
  type EaisSettings,
  type EaisPublicState,
} from '../src/contracts.js'
import { registerClient } from '../src/client.js'
import { createEaisHost, type EaisHostHandle } from '../src/index.js'
import type { ClientContext, HostContext, ResolvedCredential } from '../src/port.js'
import type { LlmAdapter } from '../src/llm.js'
import { changePasswordSession, loginSession } from '../src/session.js'

const SERVER = 'https://eais.example'
const TOKEN = 'eais_ec_card_secret'
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

const STANDARD_STREAM = [
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"content":"你"},"finish_reason":null}]}',
  '',
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}',
  '',
  'data: [DONE]',
  '',
].join('\n')

function userText() {
  return { role: 'user' as const, content: [{ type: 'text' as const, text: '你好' }] }
}

function sampleMe(overrides: Partial<EaisMe> = {}): EaisMe {
  return {
    apiVersion: '1',
    staff: { no: 'E001', name: '张三', dept: '研发' },
    card: { expiresAt: FUTURE, ttl: 3600 },
    llm: {
      baseURL: SERVER,
      models: [{
        id: 'm1', name: '测试模型', contextWindow: 8192, maxTokens: 1024, reasoning: false,
      }],
    },
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function sse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function expectEais(error: unknown): EaisError {
  if (!(error instanceof EaisError)) throw error
  return error
}

async function failureOf(block: () => unknown | Promise<unknown>): Promise<unknown> {
  try {
    await block()
    return undefined
  } catch (error) {
    return error
  }
}

function failureOfSync(block: () => unknown): unknown {
  try {
    block()
    return undefined
  } catch (error) {
    return error
  }
}

async function collect(chunks: AsyncIterable<unknown>): Promise<unknown[]> {
  const output: unknown[] = []
  for await (const chunk of chunks) output.push(chunk)
  return output
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 2000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(message)
    await tick()
  }
}

class MemorySettings {
  values: Record<string, unknown> = {}

  async get<T = unknown>(namespace: string): Promise<T | undefined> {
    return this.values[namespace] as T | undefined
  }

  async update(namespace: string, value: unknown): Promise<void> {
    this.values[namespace] = value
  }

  get eais(): EaisSettings {
    return (this.values.eais ?? {}) as EaisSettings
  }
}

class MemoryCredentials {
  value?: string
  unsetCalls = 0

  async resolve(ref: string): Promise<ResolvedCredential | undefined> {
    return ref === EAIS_TOKEN_REF && this.value ? { value: this.value, source: 'memory' } : undefined
  }

  async set(ref: string, value: string): Promise<void> {
    if (ref === EAIS_TOKEN_REF) this.value = value
  }

  async unset(ref: string): Promise<void> {
    if (ref === EAIS_TOKEN_REF) {
      this.unsetCalls += 1
      this.value = undefined
    }
  }
}

interface Call {
  url: string
  authorization?: string
}

class FakeServer {
  calls: Call[] = []
  meCalls = 0
  revokeStatus = 204
  revokeThrows?: Error

  async handle(input: string, init?: RequestInit): Promise<Response> {
    const authorization = new Headers(init?.headers).get('authorization') ?? undefined
    this.calls.push({ url: input, authorization })
    if (input.endsWith('/me')) {
      this.meCalls += 1
      return json(sampleMe())
    }
    if (input.endsWith('/auth/login')) {
      return json({ token: TOKEN, expiresAt: FUTURE, staff: sampleMe().staff })
    }
    if (input.endsWith('/auth/revoke')) {
      if (this.revokeThrows) throw this.revokeThrows
      if (this.revokeStatus === 204) return new Response(null, { status: 204 })
      return json({ error: { code: 'E_UNAVAILABLE', message: '吊销服务不可用' } }, this.revokeStatus)
    }
    if (input.endsWith('/chat/completions')) {
      return sse(STANDARD_STREAM)
    }
    return json({ error: { code: 'E_CONTRACT', message: 'unexpected route' } }, 404)
  }
}

interface FakeRegistration {
  providers: string[]
  adapter: LlmAdapter
}

class FakeLlm {
  registrations: FakeRegistration[] = []
  disposed = 0

  registerAdapter(providers: string[], adapter: LlmAdapter) {
    const handle = (() => {
      this.disposed += 1
    }) as (() => void) & { replace: (next: string[]) => void }
    handle.replace = () => undefined
    this.registrations.push({ providers, adapter })
    return handle
  }
}

interface HostHarness {
  host: EaisHostHandle
  server: FakeServer
  settings: MemorySettings
  credentials: MemoryCredentials
  llm: FakeLlm
  pluginCalls: number
  emit(event: string, ...args: unknown[]): void
}

async function createHost(options: {
  token?: string
  server?: FakeServer
  settings?: MemorySettings
  credentials?: MemoryCredentials
} = {}): Promise<HostHarness> {
  const server = options.server ?? new FakeServer()
  const settings = options.settings ?? new MemorySettings()
  const credentials = options.credentials ?? new MemoryCredentials()
  if (options.token !== undefined) credentials.value = options.token
  const llm = new FakeLlm()
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  let pluginCalls = 0

  const ctx = {
    credentials,
    settingsController: settings,
    llm,
    plugin: () => {
      pluginCalls += 1
      return {}
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const current = listeners.get(event) ?? []
      current.push(listener)
      listeners.set(event, current)
      return {
        dispose: () => {
          listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== listener))
        },
      }
    },
  } as unknown as HostContext

  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    return server.handle(String(input), init)
  }) as unknown as FetchLike

  const host = await createEaisHost(ctx, { serverUrl: SERVER, fetchImpl })
  return {
    host,
    server,
    settings,
    credentials,
    llm,
    get pluginCalls() { return pluginCalls },
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
  }
}

test('/me accepts missing mcp/ui and empty models but still validates version, URLs and expiry', () => {
  const value = {
    apiVersion: '1',
    staff: { no: 'E001', name: '张三', dept: '研发' },
    card: { expiresAt: FUTURE, ttl: 3600 },
    llm: { baseURL: SERVER, models: [] },
  }
  const me = parseMe(value, { serverUrl: SERVER })
  assert.equal(me.mcp, undefined)
  assert.equal(me.ui, undefined)
  assert.deepEqual(me.llm.models, [])

  const version = expectEais(failureOfSync(() => parseMe({ ...value, apiVersion: '2' }, { serverUrl: SERVER })))
  assert.equal(version.code, 'E_API_VERSION')

  const foreign = expectEais(failureOfSync(() => parseMe({
    ...value,
    llm: { baseURL: 'https://evil.example', models: [] },
  }, { serverUrl: SERVER })))
  assert.equal(foreign.code, 'E_API_RESPONSE')

  const expired = expectEais(failureOfSync(() => parseMe({
    ...value,
    card: { expiresAt: 'not-a-date', ttl: 3600 },
  }, { serverUrl: SERVER })))
  assert.equal(expired.code, 'E_API_RESPONSE')
})

test('credentials/reference-updated passes the ref; no token never registers an adapter', async () => {
  const harness = await createHost()
  assert.equal(harness.llm.registrations.length, 0)
  assert.equal(harness.settings.eais.state?.status, 'logged-out')

  harness.emit('credentials/reference-updated', 'OTHER_TOKEN')
  await tick()
  assert.equal(harness.server.meCalls, 0)

  harness.credentials.value = TOKEN
  harness.emit('credentials/reference-updated', EAIS_TOKEN_REF)
  await waitFor(() => harness.llm.registrations.length === 1, 'adapter was not registered after the token ref event')
  assert.equal(harness.server.meCalls, 1)
  assert.equal(harness.pluginCalls, 0)

  const state = harness.settings.eais.state
  assert.equal(state?.status, 'ready')
  assert.equal(state?.mcp.phase, 'disabled')
  assert.equal(state?.ui.card.phase, 'disabled')
  assert.equal(state?.ui.panel.phase, 'disabled')
  assert.equal(state?.ui.buttons.phase, 'disabled')

  await harness.host.dispose()
})

test('host restart restores the persisted login without authenticating again', async () => {
  const server = new FakeServer()
  const settings = new MemorySettings()
  const credentials = new MemoryCredentials()
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    return server.handle(String(input), init)
  }) as unknown as FetchLike
  const first = await createHost({ server, settings, credentials })

  await loginSession({
    settings,
    credentials,
    fetchImpl,
    serverUrl: SERVER,
    staffNo: 'E001',
    password: 'secret',
  })
  first.emit('credentials/reference-updated', EAIS_TOKEN_REF)
  await waitFor(() => first.llm.registrations.length === 1, 'initial login did not register the adapter')
  assert.equal(first.settings.eais.state?.status, 'ready')
  assert.equal(server.meCalls, 1)
  await first.host.dispose()

  const restarted = await createHost({ server, settings, credentials })
  assert.equal(restarted.credentials.value, TOKEN)
  assert.equal(restarted.llm.registrations.length, 1)
  assert.equal(restarted.settings.eais.state?.status, 'ready')
  assert.equal(restarted.settings.eais.state?.staff?.no, 'E001')
  assert.equal(server.meCalls, 2)
  assert.equal(server.calls.filter((call) => call.url.endsWith('/auth/login')).length, 1)
  await restarted.host.dispose()
})

test('changing the card updates the existing adapter instead of registering the provider twice', async () => {
  const harness = await createHost({ token: 'token-a' })
  assert.equal(harness.llm.registrations.length, 1)
  const registration = harness.llm.registrations[0]!
  const adapter = registration.adapter as EaisAdapter

  harness.credentials.value = 'token-b'
  harness.emit('credentials/reference-updated', EAIS_TOKEN_REF)
  await waitFor(() => harness.server.meCalls === 2, 'second /me was not fetched')
  assert.equal(harness.llm.registrations.length, 1)
  assert.deepEqual(registration.providers, ['eais'])

  await collect(adapter.stream({ provider: 'eais', model: 'm1', messages: [userText()] }))
  const chat = harness.server.calls.filter((call) => call.url.endsWith('/chat/completions')).at(-1)
  assert.equal(chat?.authorization, 'Bearer token-b')
  await harness.host.dispose()
})

test('failed or ambiguous revoke never unsets credentials or unmounts the adapter', async () => {
  const harness = await createHost({ token: TOKEN })
  assert.equal(harness.llm.registrations.length, 1)
  harness.server.revokeStatus = 500

  const error = expectEais(await failureOf(() => harness.host.logout()))
  assert.equal(error.code, 'E_REVOKE_UNCONFIRMED')
  assert.match(error.message, /服务端吊销未确认/)
  assert.equal(harness.credentials.unsetCalls, 0)
  assert.equal(harness.credentials.value, TOKEN)
  assert.equal(harness.llm.disposed, 0)
  assert.equal(harness.settings.eais.state?.status, 'degraded')

  harness.server.revokeThrows = new Error('network down')
  harness.server.revokeStatus = 204
  const ambiguous = expectEais(await failureOf(() => harness.host.logout()))
  assert.equal(ambiguous.code, 'E_REVOKE_UNCONFIRMED')
  assert.equal(harness.credentials.unsetCalls, 0)
  assert.equal(harness.llm.disposed, 0)

  await harness.host.dispose()
})

test('successful revoke unsets credentials and unmounts the adapter', async () => {
  const harness = await createHost({ token: TOKEN })
  await harness.host.logout()
  assert.equal(harness.credentials.unsetCalls, 1)
  assert.equal(harness.credentials.value, undefined)
  assert.equal(harness.llm.disposed, 1)
  assert.equal(harness.settings.eais.state?.status, 'logged-out')
  assert.equal(harness.settings.eais.logoutRequestedAt, '')
  await harness.host.dispose()
})

test('SSE event:error terminates with the server code and message', async () => {
  const body = [
    'event: error',
    'data: {"error":{"code":"E_LIMIT","message":"本月额度已用完，11 月 1 日重置","retryable":true}}',
    '',
  ].join('\n')
  const error = expectEais(await failureOf(() => collect(readOpenAIStream(sse(body)))))
  assert.equal(error.code, 'E_LIMIT')
  assert.match(error.message, /本月额度/)

  const malformed = expectEais(await failureOf(() => collect(readOpenAIStream(sse('event: error\ndata: not-json\n\n')))))
  assert.equal(malformed.code, 'E_CONTRACT')
})

test('SSE keeps usage and refuses a stream that ends without [DONE]', async () => {
  const chunks = await collect(readOpenAIStream(sse(STANDARD_STREAM)))
  assert.ok(chunks.some((chunk) => {
    const value = chunk as { type?: string; usage?: { totalTokens?: number } }
    return value.type === 'usage' && value.usage?.totalTokens === 12
  }))
  assert.ok(chunks.some((chunk) => (chunk as { type?: string }).type === 'finish'))

  const truncated = [
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"content":"x"},"finish_reason":"stop"}]}',
    '',
  ].join('\n')
  const error = expectEais(await failureOf(() => collect(readOpenAIStream(sse(truncated)))))
  assert.equal(error.code, 'E_TIMEOUT')
})

test('max-tokens truncation drops partial tool calls and finishes normally', async () => {
  const body = [
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"write","arguments":"{\\"path\\":\\"a.js\\",\\"content\\":\\"const x"}}]},"finish_reason":null}]}',
    '',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{},"finish_reason":"length"}]}',
    '',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4096,"total_tokens":4106}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')

  const chunks = await collect(readOpenAIStream(sse(body)))
  assert.ok(chunks.some((chunk) => (chunk as { type?: string }).type === 'tool-call-delta'))
  assert.equal(chunks.filter((chunk) => {
    const value = chunk as { type?: string; block?: { type?: string } }
    return value.type === 'block-end' && value.block?.type === 'tool-call'
  }).length, 0)
  const finish = chunks.find((chunk) => (chunk as { type?: string }).type === 'finish') as {
    reason?: { kind?: string }
  }
  assert.equal(finish.reason?.kind, 'max-tokens')
})

test('tool call fragments ending with stop remain a contract error', async () => {
  const body = [
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"write","arguments":"{}"}}]},"finish_reason":null}]}',
    '',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')

  const error = expectEais(await failureOf(() => collect(readOpenAIStream(sse(body)))))
  assert.equal(error.code, 'E_CONTRACT')
  assert.match(error.message, /tool_calls/)
})

test('abort cancels the stream and surfaces the abort reason', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"x"},"finish_reason":null}]}\n\n'))
    },
  })
  const controller = new AbortController()
  controller.abort(new Error('cancelled by user'))
  const error = await failureOf(() => collect(readOpenAIStream(new Response(stream), controller.signal)))
  assert.ok(error instanceof Error)
  assert.equal(error.message, 'cancelled by user')
})

test('L0 drops tool declarations but forwards streamed tool calls; images stay refused', async () => {
  const image = expectEais(failureOfSync(() => toOpenAIMessages([{
    role: 'user',
    content: [{ type: 'image', attachment: {} }],
  } as unknown as Parameters<typeof toOpenAIMessages>[0][number]])))
  assert.equal(image.code, 'E_MALFORMED')

  const requests: RequestInit[] = []
  const adapter = new EaisAdapter({
    me: sampleMe(),
    token: TOKEN,
    fetchImpl: (async (_url, init) => {
      if (init) requests.push(init)
      return sse(STANDARD_STREAM)
    }) as FetchLike,
  })
  await collect(adapter.stream({
    provider: 'eais',
    model: 'm1',
    messages: [userText()],
    tools: [{ name: 'lookup', description: 'test', parameters: {} }],
  }))
  const requestBody = JSON.parse(String(requests[0]?.body)) as { tools?: unknown }
  assert.equal(requestBody.tools, undefined)

  const upstreamTools = new EaisAdapter({
    me: sampleMe(),
    token: TOKEN,
    fetchImpl: (async () => sse([
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{}"}}]},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'))) as unknown as FetchLike,
  })
  const chunks = await collect(upstreamTools.stream({
    provider: 'eais',
    model: 'm1',
    messages: [userText()],
  }))
  assert.ok(chunks.some((chunk) => (chunk as { type?: string }).type === 'tool-call-delta'))
  assert.ok(chunks.some((chunk) => {
    const value = chunk as { type?: string; reason?: { kind?: string } }
    return value.type === 'finish' && value.reason?.kind === 'tool-calls'
  }))
})

test('login writes serverUrl before storing the card token', async () => {
  const order: string[] = []
  class OrderedSettings extends MemorySettings {
    async update(namespace: string, value: unknown): Promise<void> {
      order.push('settings')
      await super.update(namespace, value)
    }
  }
  class OrderedCredentials extends MemoryCredentials {
    async set(ref: string, value: string): Promise<void> {
      order.push('set')
      await super.set(ref, value)
    }
  }
  const settings = new OrderedSettings()
  settings.values.eais = { logoutRequestedAt: 'stale-request' }
  const credentials = new OrderedCredentials()
  const server = new FakeServer()
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    return server.handle(String(input), init)
  }) as unknown as FetchLike

  const result = await loginSession({
    settings,
    credentials,
    fetchImpl,
    serverUrl: SERVER,
    staffNo: 'E001',
    password: 'secret',
    pendingState: initialPublicState('connecting'),
  })
  assert.deepEqual(order, ['settings', 'set'])
  assert.equal(result.token, TOKEN)
  assert.equal(credentials.value, TOKEN)
  assert.equal(settings.eais.serverUrl, SERVER)
  assert.equal(settings.eais.logoutRequestedAt, '')
  assert.equal((settings.eais.state as EaisPublicState).status, 'connecting')
})

test('password change posts to /auth/password and clears the revoked card', async () => {
  const settings = new MemorySettings()
  const credentials = new MemoryCredentials()
  credentials.value = TOKEN
  const calls: Array<{ url: string; body: string }> = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body) })
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as FetchLike

  await changePasswordSession({
    settings,
    credentials,
    fetchImpl,
    serverUrl: SERVER,
    staffNo: 'E001',
    currentPassword: 'old-password-123',
    newPassword: 'new-password-456',
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url, `${SERVER}/auth/password`)
  assert.deepEqual(JSON.parse(calls[0]?.body ?? '{}'), {
    staffNo: 'E001', currentPassword: 'old-password-123', newPassword: 'new-password-456',
  })
  assert.equal(credentials.value, undefined)
  assert.equal(credentials.unsetCalls, 1)
  assert.equal(settings.eais.state?.status, 'logged-out')
})

test('failed password change keeps the current card', async () => {
  const settings = new MemorySettings()
  const credentials = new MemoryCredentials()
  credentials.value = TOKEN
  const fetchImpl = (async () => new Response(
    JSON.stringify({ error: { code: 'policy', message: '工号或当前密码不正确' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )) as unknown as FetchLike

  await assert.rejects(() => changePasswordSession({
    settings,
    credentials,
    fetchImpl,
    serverUrl: SERVER,
    staffNo: 'E001',
    currentPassword: 'bad-password',
    newPassword: 'new-password-456',
  }), /工号或当前密码不正确/)
  assert.equal(credentials.value, TOKEN)
  assert.equal(credentials.unsetCalls, 0)
})
test('L0 client registers only the settings section, never cards/panels/buttons', async () => {
  const registered: Array<{ slot: string; value: unknown }> = []
  const slot = (name: string) => ({
    async register(value: unknown) {
      registered.push({ slot: name, value })
      return { dispose: () => undefined }
    },
  })
  const settings = new MemorySettings()
  const ctx = {
    remote: { credentials: new MemoryCredentials() },
    settingsController: settings,
    settings: { section: slot('settings') },
    conversation: { chat: { turnTail: slot('turnTail') } },
    sidebar: { right: { pane: { tab: slot('pane') } } },
    userQuestions: { request: slot('questions') },
    on: () => ({ dispose: () => undefined }),
  } as unknown as ClientContext

  const registration = await registerClient(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0]?.slot, 'settings')
  assert.equal(settings.eais.state?.ui.card.phase, 'disabled')
  assert.equal(settings.eais.state?.ui.panel.phase, 'disabled')
  assert.equal(settings.eais.state?.ui.buttons.phase, 'disabled')
  await registration.dispose()
})

test('rc.2 slots registry receives the settings and card contributions', async () => {
  const registrations: Array<{ options: { name: string }; component: unknown }> = []
  const settings = new MemorySettings()
  const ctx = {
    remote: { credentials: new MemoryCredentials() },
    settingsController: settings,
    slots: {
      async register(options: { name: string }, component: unknown) {
        registrations.push({ options, component })
        return { dispose: () => undefined }
      },
    },
    settings: {
      section: {
        register() {
          throw new Error('legacy settings slot must not be used when slots exists')
        },
      },
    },
    on: () => ({ dispose: () => undefined }),
  } as unknown as ClientContext

  const registration = await registerClient(ctx)
  assert.equal(registrations.length, 4)
  const names = registrations.map((entry) => entry.options.name)
  assert.ok(names.includes('settings.section'))
  assert.equal(names.filter((name) => name === 'tool.call.toolview').length, 0)
  assert.ok(names.includes('conversation.chat.turnTail'))
  assert.ok(names.includes('sidebar.right.pane.tab'))
  assert.ok(names.includes('sidebar.right.pane.tab.title'))
  await registration.dispose()
})

test('settings logout request reaches the Host and completes revoke before unset', async () => {
  const harness = await createHost({ token: TOKEN })
  const state = harness.settings.eais.state
  await harness.settings.update('eais', {
    serverUrl: SERVER,
    state,
    logoutRequestedAt: new Date().toISOString(),
  })
  harness.emit('settings/document-updated')
  await waitFor(() => harness.credentials.unsetCalls === 1, 'the settings logout request was not processed')
  assert.equal(harness.credentials.value, undefined)
  assert.equal(harness.llm.disposed, 1)
  assert.equal(harness.settings.eais.state?.status, 'logged-out')
  assert.equal(harness.settings.eais.logoutRequestedAt, '')
  await harness.host.dispose()
})

test('adapter reads the live session token for every stream', async () => {
  let session: EaisRuntimeSession = { me: sampleMe(), token: 'first' }
  const server = new FakeServer()
  const adapter = new EaisAdapter({
    readSession: () => session,
    fetchImpl: ((input: string | URL | Request, init?: RequestInit) => server.handle(String(input), init)) as unknown as FetchLike,
  })
  await collect(adapter.stream({ provider: 'eais', model: 'm1', messages: [userText()] }))
  session = { me: sampleMe(), token: 'second' }
  await collect(adapter.stream({ provider: 'eais', model: 'm1', messages: [userText()] }))
  const auth = server.calls.filter((call) => call.url.endsWith('/chat/completions')).map((call) => call.authorization)
  assert.deepEqual(auth, ['Bearer first', 'Bearer second'])
})

test('streamed tool arguments are aggregated by index before block-end', async () => {
  const adapter = new EaisAdapter({
    me: sampleMe(),
    token: TOKEN,
    fetchImpl: (async () => sse([
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{\\"query\\""}}]},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"x\\"}"}}]},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'))) as unknown as FetchLike,
  })
  const chunks = await collect(adapter.stream({
    provider: 'eais',
    model: 'm1',
    messages: [userText()],
  }))
  const completed = chunks.find((chunk) => {
    const value = chunk as { type?: string; block?: { type?: string; name?: string; arguments?: string } }
    return value.type === 'block-end' && value.block?.type === 'tool-call'
  }) as { block: { name: string; arguments: string } }
  assert.equal(completed.block.name, 'lookup')
  assert.equal(completed.block.arguments, '{"query":"x"}')
  assert.ok(chunks.some((chunk) => (chunk as { type?: string }).type === 'finish'))
})
