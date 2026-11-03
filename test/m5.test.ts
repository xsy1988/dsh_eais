import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMe, type FetchLike } from '../src/api.js'
import { EaisAdapter } from '../src/adapter/index.js'
import { toOpenAIMessages } from '../src/adapter/messages.js'
import {
  EAIS_TOKEN_REF,
  EaisError,
  type EaisMe,
  type EaisSettings,
} from '../src/contracts.js'
import { createEaisHost, type EaisHostHandle } from '../src/index.js'
import type { LlmAdapter } from '../src/llm.js'
import type { HostContext, RequestMessage, ResolvedCredential } from '../src/port.js'

const SERVER = 'https://eais.example'
const MCP_URL = `${SERVER}/mcp`
const TOKEN = 'eais_ec_card_secret'
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

const STANDARD_STREAM = [
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"content":"好"},"finish_reason":null}]}',
  '',
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":1,"total_tokens":11}}',
  '',
  'data: [DONE]',
  '',
].join('\n')

const TOOL_STREAM = [
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{\\"query\\":\\"x\\"}"}}]},"finish_reason":null}]}',
  '',
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"m1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
  '',
  'data: [DONE]',
  '',
].join('\n')

function sampleMe(overrides: Partial<EaisMe> = {}): EaisMe {
  return {
    apiVersion: '1',
    staff: { no: 'E001', name: '张三', dept: '研发' },
    card: { expiresAt: FUTURE, ttl: 3600 },
    llm: {
      baseURL: SERVER,
      models: [{ id: 'm1', name: '测试模型', contextWindow: 8192, maxTokens: 1024, reasoning: false }],
    },
    ...overrides,
  }
}

function meWithMcp(): EaisMe {
  return sampleMe({ mcp: { url: MCP_URL, serverName: 'eais' } })
}

function userText() {
  return { role: 'user' as const, content: [{ type: 'text' as const, text: '你好' }] }
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

  constructor(value?: string) {
    this.value = value
  }

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

class FakeServer {
  calls: Array<{ url: string; authorization?: string }> = []
  meCalls = 0

  constructor(private readonly value: EaisMe) {}

  async handle(input: string, init?: RequestInit): Promise<Response> {
    const authorization = new Headers(init?.headers).get('authorization') ?? undefined
    this.calls.push({ url: input, authorization })
    if (input.endsWith('/me')) {
      this.meCalls += 1
      return json(this.value)
    }
    if (input.endsWith('/auth/login')) {
      return json({ token: TOKEN, expiresAt: FUTURE, staff: this.value.staff })
    }
    if (input.endsWith('/auth/revoke')) {
      return new Response(null, { status: 204 })
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

interface McpCall {
  plugin: unknown
  config: {
    transport?: string
    serverName?: string
    url?: string
    headers?: Record<string, string>
    toolCallTimeoutMs?: number
    failOnStartupError?: boolean
  }
}

class FakeMcpHost {
  calls: McpCall[] = []
  disposedConfigs: McpCall['config'][] = []
  throwOnMount?: Error

  plugin(plugin: unknown, config: McpCall['config']): unknown {
    this.calls.push({ plugin, config })
    if (this.throwOnMount) throw this.throwOnMount
    return {
      dispose: async () => {
        this.disposedConfigs.push(config)
      },
    }
  }
}

interface HostHarness {
  host: EaisHostHandle
  server: FakeServer
  settings: MemorySettings
  credentials: MemoryCredentials
  llm: FakeLlm
  mcp: FakeMcpHost
  emit(event: string, ...args: unknown[]): void
}

async function createHost(options: {
  token?: string
  me?: EaisMe
  mcp?: FakeMcpHost
} = {}): Promise<HostHarness> {
  const server = new FakeServer(options.me ?? meWithMcp())
  const settings = new MemorySettings()
  const credentials = new MemoryCredentials(options.token)
  const llm = new FakeLlm()
  const mcp = options.mcp ?? new FakeMcpHost()
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  const ctx = {
    credentials,
    settingsController: settings,
    llm,
    plugin: (plugin: unknown, config: McpCall['config']) => mcp.plugin(plugin, config),
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
    mcp,
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
  }
}

test('assistant tool calls and tool results map to OpenAI tool history', () => {
  const assistant = {
    id: 'm1',
    role: 'assistant',
    source: { kind: 'model', provider: 'eais', model: 'm1' },
    content: [
      { type: 'text', text: '我先查' },
      { type: 'tool-call', id: 'call_1', name: 'lookup', arguments: '{"query":"x"}' },
    ],
  }
  const tool = {
    id: 'm2',
    role: 'tool',
    source: { kind: 'tool', callId: 'call_1' },
    toolCallId: 'call_1',
    content: [{ type: 'text', text: '42' }],
  }

  const converted = toOpenAIMessages([assistant, tool] as unknown as RequestMessage[])
  assert.deepEqual(converted, [
    {
      role: 'assistant',
      content: '我先查',
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'lookup', arguments: '{"query":"x"}' },
      }],
    },
    { role: 'tool', tool_call_id: 'call_1', content: '42' },
  ])

  const invalid = expectEais(failureOfSync(() => toOpenAIMessages([{
    ...assistant,
    content: [{ type: 'tool-call', id: 'call_2', name: 'lookup', arguments: '{oops' }],
  }] as unknown as RequestMessage[])))
  assert.equal(invalid.code, 'E_MALFORMED')

  const orphan = expectEais(failureOfSync(() => toOpenAIMessages([tool] as unknown as RequestMessage[])))
  assert.equal(orphan.code, 'E_MALFORMED')
})

test('/me.mcp enables OpenAI tools and streamed tool-call chunks pass through', async () => {
  const requests: RequestInit[] = []
  const adapter = new EaisAdapter({
    me: meWithMcp(),
    token: TOKEN,
    fetchImpl: (async (_url, init) => {
      if (init) requests.push(init)
      return sse(TOOL_STREAM)
    }) as FetchLike,
  })

  const chunks = await collect(adapter.stream({
    provider: 'eais',
    model: 'm1',
    messages: [userText()],
    tools: [{ name: 'lookup', description: '查资料', parameters: { type: 'object' } }],
  }))

  const body = JSON.parse(String(requests[0]?.body)) as {
    tools?: Array<{ type: string; function: { name: string; description: string; parameters: unknown } }>
    tool_choice?: string
  }
  assert.deepEqual(body.tools, [{
    type: 'function',
    function: { name: 'lookup', description: '查资料', parameters: { type: 'object' } },
  }])
  assert.equal(body.tool_choice, 'auto')
  assert.ok(chunks.some((chunk) => {
    const value = chunk as { type?: string; blockType?: string }
    return value.type === 'block-start' && value.blockType === 'tool-call'
  }))
  assert.ok(chunks.some((chunk) => (chunk as { type?: string }).type === 'tool-call-delta'))
  assert.ok(chunks.some((chunk) => {
    const value = chunk as { type?: string; block?: { type?: string; name?: string } }
    return value.type === 'block-end' && value.block?.type === 'tool-call' && value.block.name === 'lookup'
  }))
  assert.ok(chunks.some((chunk) => {
    const value = chunk as { type?: string; reason?: { kind?: string } }
    return value.type === 'finish' && value.reason?.kind === 'tool-calls'
  }))
})

test('/me.mcp mounts the host MCP client, rebuilds it on card change and disposes it on logout', async () => {
  const harness = await createHost({ token: 'card-a' })

  assert.equal(harness.mcp.calls.length, 1)
  const first = harness.mcp.calls[0]!.config
  assert.equal(first.transport, 'streamable-http')
  assert.equal(first.serverName, 'eais')
  assert.equal(first.url, MCP_URL)
  assert.equal(first.headers?.Authorization, 'Bearer card-a')
  assert.ok(first.headers?.['X-EAIS-Client-Timezone'])
  assert.equal(first.toolCallTimeoutMs, 60_000)
  assert.equal(first.failOnStartupError, false)
  assert.equal(harness.settings.eais.state?.mcp.phase, 'ready')

  harness.credentials.value = 'card-b'
  harness.emit('credentials/reference-updated', EAIS_TOKEN_REF)
  await waitFor(() => harness.mcp.calls.length === 2, 'MCP was not remounted after the card changed')

  assert.equal(harness.mcp.disposedConfigs.length, 1)
  assert.equal(harness.mcp.disposedConfigs[0]?.headers?.Authorization, 'Bearer card-a')
  assert.equal(harness.mcp.calls[1]!.config.headers?.Authorization, 'Bearer card-b')
  assert.equal(harness.settings.eais.state?.mcp.phase, 'ready')

  await harness.host.logout()
  assert.equal(harness.mcp.disposedConfigs.length, 2)
  assert.equal(harness.settings.eais.state?.status, 'logged-out')
  assert.equal(harness.settings.eais.state?.mcp.phase, 'disabled')
  await harness.host.dispose()
})

test('a failed MCP mount degrades only the MCP capability', async () => {
  const mcp = new FakeMcpHost()
  mcp.throwOnMount = new Error('mcp endpoint unavailable')
  const harness = await createHost({ token: TOKEN, mcp })

  assert.equal(harness.mcp.calls.length, 1)
  const state = harness.settings.eais.state
  assert.equal(state?.status, 'ready')
  assert.equal(state?.mcp.phase, 'failed')
  assert.equal(state?.mcp.reason?.message, 'mcp endpoint unavailable')
  assert.equal(state?.llm.phase, 'ready')
  assert.equal(harness.llm.registrations.length, 1)
  assert.equal(harness.llm.disposed, 0)

  const adapter = harness.llm.registrations[0]!.adapter as EaisAdapter
  const chunks = await collect(adapter.stream({ provider: 'eais', model: 'm1', messages: [userText()] }))
  assert.ok(chunks.some((chunk) => (chunk as { type?: string }).type === 'finish'))
  await harness.host.dispose()
})

test('without /me.mcp the host does not mount MCP and reports it disabled', async () => {
  const harness = await createHost({ token: TOKEN, me: sampleMe() })

  assert.equal(harness.mcp.calls.length, 0)
  const state = harness.settings.eais.state
  assert.equal(state?.status, 'ready')
  assert.equal(state?.mcp.phase, 'disabled')
  await harness.host.dispose()
})

test('/me rejects an MCP declaration whose serverName is not eais', () => {
  const error = expectEais(failureOfSync(() => parseMe({
    ...sampleMe(),
    mcp: { url: MCP_URL, serverName: 'other' },
  }, { serverUrl: SERVER })))
  assert.equal(error.code, 'E_API_RESPONSE')
})
