import { afterEach, expect, it } from 'vitest'
import { Context } from '../../DSH_pre/dsh/vendor/cordis/src/index.ts'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { AttachmentBridge } from '../src/attachments.ts'
import { EaisAdapter } from '../src/adapter/index.ts'
import type { EaisMe } from '../src/contracts.ts'
import type { ContentBlock } from '../src/port.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

it('uses the real DSH file projection and sends only the EAIS attachment reference', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  ctx.provide('attachments', {
    fileHostPath: () => undefined,
    readFileStream: async function* () { yield new Uint8Array([1, 2, 3]) },
  })
  const me: EaisMe = {
    apiVersion: '1', staff: { no: 'E1', name: '员工', dept: '部门' },
    card: { expiresAt: new Date(Date.now() + 60000).toISOString(), ttl: 300 },
    llm: {
      baseURL: 'http://eais.test/llm/v1',
      models: [{ id: 'm1', name: '文本模型', contextWindow: 1000, maxTokens: 100, reasoning: false }],
    },
    attachments: { enabled: true, types: ['pdf'], maxFileBytes: 1000, maxUnits: 10, maxMessageAttachments: 2, maxSliceChars: 100 },
  }
  const bodies: unknown[] = []
  const fetchImpl = async (_input: unknown, init?: RequestInit) => {
    if (init?.body instanceof FormData) return new Response(JSON.stringify({ id: 'att-1', status: 'ready' }), { status: 202 })
    bodies.push(JSON.parse(String(init?.body)))
    return new Response([
      'data: {"choices":[{"delta":{"content":"已读取"},"finish_reason":null}]}',
      '',
      'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
      '',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' } })
  }
  const bridge = new AttachmentBridge(ctx, () => ({ me, token: 'token' }), fetchImpl as typeof fetch)
  const dispose = bridge.install()
  const registration = ctx.llm.registerAdapter(['eais'], new EaisAdapter({ me, token: 'token', fetchImpl: fetchImpl as typeof fetch, attachments: bridge }))
  const file = { attachmentId: 'sha256:file', name: '合同.pdf', bytes: 3 } as Extract<ContentBlock, { type: 'file' }>['attachment']
  for await (const _chunk of ctx.llm.stream({ provider: 'eais', model: 'm1', sessionId: 's1', messages: [{ role: 'user', content: [{ type: 'file', attachment: file }] }] })) {
  }
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({ messages: [{ role: 'user', content: '', attachments: [{ id: 'att-1' }] }] })
  expect(JSON.stringify(bodies[0])).not.toContain('sha256')
  registration()
  dispose()
})


it('passes the DSH image modality gate and sends only the EAIS reference', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  ctx.provide('attachments', {
    readImage: async () => ({ data: new Uint8Array([1, 2, 3]) }),
  })
  const me: EaisMe = {
    apiVersion: '1', staff: { no: 'E1', name: '员工', dept: '部门' },
    card: { expiresAt: new Date(Date.now() + 60000).toISOString(), ttl: 300 },
    llm: {
      baseURL: 'http://eais.test/llm/v1',
      models: [{ id: 'm1', name: '文本模型', contextWindow: 1000, maxTokens: 100, reasoning: false }],
    },
    attachments: { enabled: true, types: ['image'], maxFileBytes: 1000, maxUnits: 10, maxMessageAttachments: 2, maxSliceChars: 100 },
  }
  let requestBody: unknown
  const fetchImpl = async (_input: unknown, init?: RequestInit) => {
    if (init?.body instanceof FormData) return new Response(JSON.stringify({ id: 'att-image', status: 'ready' }), { status: 202 })
    requestBody = JSON.parse(String(init?.body))
    return new Response([
      'data: {"choices":[{"delta":{"content":"已读取"},"finish_reason":null}]}', '',
      'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}', '',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}', '', 'data: [DONE]', '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' } })
  }
  const bridge = new AttachmentBridge(ctx, () => ({ me, token: 'token' }), fetchImpl as typeof fetch)
  const dispose = bridge.install()
  const adapter = new EaisAdapter({ me, token: 'token', fetchImpl: fetchImpl as typeof fetch, attachments: bridge })
  expect((await adapter.resolveModel('eais', 'm1')).inputModalities).toContain('image')
  const registration = ctx.llm.registerAdapter(['eais'], adapter)
  const image = { attachmentId: 'sha256:image', mediaType: 'image/png', bytes: 3, width: 1, height: 1 } as Extract<ContentBlock, { type: 'image' }>['attachment']
  for await (const _chunk of ctx.llm.stream({ provider: 'eais', model: 'm1', sessionId: 's1', messages: [{ role: 'user', content: [{ type: 'image', attachment: image }] }] })) {
  }
  expect(requestBody).toMatchObject({ messages: [{ role: 'user', content: '', attachments: [{ id: 'att-image' }] }] })
  expect(JSON.stringify(requestBody)).not.toContain('base64')
  registration()
  dispose()
})
