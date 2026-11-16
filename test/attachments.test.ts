import assert from 'node:assert/strict'
import test from 'node:test'
import { textOnlyImageText } from '@deepseek-ai/dsh-llm'
import { AttachmentBridge } from '../src/attachments.js'
import { toOpenAIMessages } from '../src/adapter/messages.js'
import { EaisAdapter } from '../src/adapter/index.js'
import type { EaisMe } from '../src/contracts.js'
import type { ContentBlock, GenerateOptions, RequestMessage, StreamChunk } from '../src/port.js'
import type { HostContext } from '../src/port.js'

const me: EaisMe = {
  apiVersion: '1', staff: { no: 'E1', name: '员工', dept: '部门' },
  card: { expiresAt: new Date(Date.now() + 60000).toISOString(), ttl: 300 },
  llm: { baseURL: 'http://eais.test/llm/v1', models: [{ id: 'm1', name: '文本模型', contextWindow: 1000, maxTokens: 100, reasoning: false }] },
  attachments: { enabled: true, types: ['image', 'pdf', 'word', 'ppt', 'excel'], maxFileBytes: 1000, maxUnits: 10, maxMessageAttachments: 2, maxSliceChars: 100 },
}

function message(content: ContentBlock[]): RequestMessage {
  return { role: 'user', content } as RequestMessage
}

function options(content: ContentBlock[]): GenerateOptions {
  return { provider: 'eais', model: 'm1', sessionId: 'session-1', messages: [message(content)] } as GenerateOptions
}

test('file projection resolves to an EAIS reference without sending the local handle', async () => {
  let listener: ((options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>) | undefined
  const file = { attachmentId: 'sha256:abcdef', name: 'a.pdf', bytes: 3 } as Extract<ContentBlock, { type: 'file' }>['attachment']
  const ctx = {
    llm: { fileRequestText: () => 'FILE-HANDLE' },
    get: (name: string) => name === 'attachments' ? {
      readFileStream: async function* () { yield new Uint8Array([1, 2, 3]) },
    } : undefined,
    on: (_name: string, callback: typeof listener) => { listener = callback },
  } as unknown as HostContext
  const bridge = new AttachmentBridge(ctx, () => ({ me, token: 'token' }), async () => new Response(JSON.stringify({ id: 'att-file', status: 'ready' }), { status: 202 }))
  bridge.install()
  let projected: ReturnType<typeof toOpenAIMessages> = []
  for await (const _chunk of listener!(options([{ type: 'file', attachment: file }]), () => (async function* () {
    projected = toOpenAIMessages([message([{ type: 'text', text: 'FILE-HANDLE' }])], undefined, bridge, 'session-1')
  })())) {
  }
  assert.deepEqual(projected, [{ role: 'user', content: '', attachments: [{ id: 'att-file' }] }])
})

test('image text projection resolves to an EAIS reference', async () => {
  let listener: ((options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>) | undefined
  const image = { attachmentId: 'sha256:image', mediaType: 'image/png', bytes: 3, width: 1, height: 1 } as Extract<ContentBlock, { type: 'image' }>['attachment']
  const ctx = {
    llm: {},
    get: (name: string) => name === 'attachments' ? { readImage: async () => ({ data: new Uint8Array([1, 2, 3]) }) } : undefined,
    on: (_name: string, callback: typeof listener) => { listener = callback },
  } as unknown as HostContext
  const bridge = new AttachmentBridge(ctx, () => ({ me, token: 'token' }), async () => new Response(JSON.stringify({ id: 'att-image', status: 'ready' }), { status: 202 }))
  bridge.install()
  let projected: ReturnType<typeof toOpenAIMessages> = []
  for await (const _chunk of listener!(options([{ type: 'image', attachment: image }]), () => (async function* () {
    projected = toOpenAIMessages([message([{ type: 'text', text: textOnlyImageText(image) }])], undefined, bridge, 'session-1')
  })())) {
  }
  assert.deepEqual(projected[0]?.attachments, [{ id: 'att-image' }])
  const native = toOpenAIMessages([message([{ type: 'image', attachment: image }])], undefined, bridge, 'session-1')
  assert.deepEqual(native, [{ role: 'user', content: '', attachments: [{ id: 'att-image' }] }])
})

test('attachment input fails closed when the server does not advertise it', async () => {
  let listener: ((options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>) | undefined
  const ctx = { llm: {}, on: (_name: string, callback: typeof listener) => { listener = callback } } as unknown as HostContext
  const bridge = new AttachmentBridge(ctx, () => ({ me: { ...me, attachments: undefined }, token: 'token' }), async () => { throw new Error('must not upload') })
  bridge.install()
  const image = { attachmentId: 'sha256:image', mediaType: 'image/png', bytes: 3, width: 1, height: 1 } as Extract<ContentBlock, { type: 'image' }>['attachment']
  let called = false
  const chunks = []
  for await (const chunk of listener!(options([{ type: 'image', attachment: image }]), () => { called = true; return (async function* () {})() })) chunks.push(chunk)
  assert.equal(called, false)
  assert.equal(chunks[0]?.type, 'finish')
})


test('EAIS route declares image only when server-side OCR attachment support is enabled', async () => {
  const enabled = new EaisAdapter({ me, token: 'token' })
  const resolved = await enabled.resolveModel('eais', 'm1')
  assert.deepEqual(resolved.inputModalities, ['text', 'image'])
  const disabled = new EaisAdapter({ me: { ...me, attachments: undefined }, token: 'token' })
  const text = await disabled.resolveModel('eais', 'm1')
  assert.deepEqual(text.inputModalities, ['text'])
})


test('tool images degrade to metadata text and remain safe on later replay', () => {
  const image = { attachmentId: 'sha256:tool-image', mediaType: 'image/webp', bytes: 3, width: 838, height: 486 } as Extract<ContentBlock, { type: 'image' }>['attachment']
  const file = { attachmentId: 'sha256:tool-file', name: 'result.txt', bytes: 12 } as Extract<ContentBlock, { type: 'file' }>['attachment']
  const history = [
    { role: 'assistant', content: [{ type: 'tool-call', id: 'call-1', name: 'read_image', arguments: '{}' }] },
    { role: 'tool', toolCallId: 'call-1', content: [{ type: 'image', attachment: image }, { type: 'file', attachment: file }] },
  ] as unknown as RequestMessage[]
  for (let index = 0; index < 2; index++) {
    const converted = toOpenAIMessages(history)
    assert.equal(converted[1]?.role, 'tool')
    assert.equal(converted[1]?.content, '[工具返回图片：image/webp，838×486 px][工具返回文件：result.txt，12 bytes]')
    assert.equal(converted[1]?.attachments, undefined)
  }
})


test('tool image history bypasses user upload bridge even when attachments are disabled', async () => {
  let listener: ((options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>) | undefined
  const ctx = { llm: {}, on: (_name: string, callback: typeof listener) => { listener = callback } } as unknown as HostContext
  const bridge = new AttachmentBridge(ctx, () => ({ me: { ...me, attachments: undefined }, token: 'token' }), async () => { throw new Error('must not upload') })
  bridge.install()
  const image = { attachmentId: 'sha256:tool', mediaType: 'image/webp', bytes: 3, width: 838, height: 486 } as Extract<ContentBlock, { type: 'image' }>['attachment']
  const request = options([])
  request.messages = [
    { role: 'assistant', content: [{ type: 'tool-call', id: 'call-1', name: 'read_image', arguments: '{}' }] },
    { role: 'tool', toolCallId: 'call-1', content: [{ type: 'image', attachment: image }] },
  ] as unknown as RequestMessage[]
  let called = false
  for await (const _chunk of listener!(request, () => { called = true; return (async function* () {})() })) {
  }
  assert.equal(called, true)
})
