import { EaisError } from '../contracts.js'
import type { ContentBlock, StreamChunk, ToolCallId } from '../port.js'

interface OpenBlock {
  index: number
  type: 'text' | 'reasoning'
  text: string
}

interface ToolBlock {
  index: number
  upstreamIndex: number
  id: ToolCallId
  name?: string
  arguments: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export class OpenAIStreamAssembler {
  private nextIndex = 0
  private text?: OpenBlock
  private reasoning?: OpenBlock
  private readonly tools = new Map<number, ToolBlock>()
  private finishReason?: string
  private done = false
  private closed = false

  accept(value: unknown): StreamChunk[] {
    if (!isRecord(value) || !Array.isArray(value.choices)) {
      throw new EaisError('E_CONTRACT', '模型流缺少 choices')
    }
    const chunks: StreamChunk[] = []
    if (this.finishReason) {
      if (value.choices.length) throw new EaisError('E_CONTRACT', '结束标记后仍收到模型内容')
      if (isRecord(value.usage)) chunks.push(this.usage(value.usage))
      return chunks
    }
    for (const rawChoice of value.choices) {
      if (!isRecord(rawChoice)) throw new EaisError('E_CONTRACT', '模型流 choice 无效')
      if (isRecord(rawChoice.delta)) {
        const delta = rawChoice.delta
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          if (!this.reasoning) {
            this.reasoning = { index: this.nextIndex++, type: 'reasoning', text: '' }
            chunks.push({ type: 'block-start', index: this.reasoning.index, blockType: 'reasoning' })
          }
          this.reasoning.text += delta.reasoning_content
          chunks.push({ type: 'reasoning-delta', index: this.reasoning.index, text: delta.reasoning_content })
        }
        if (typeof delta.content === 'string' && delta.content) {
          if (!this.text) {
            this.text = { index: this.nextIndex++, type: 'text', text: '' }
            chunks.push({ type: 'block-start', index: this.text.index, blockType: 'text' })
          }
          this.text.text += delta.content
          chunks.push({ type: 'text-delta', index: this.text.index, text: delta.content })
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const rawCall of delta.tool_calls) {
            chunks.push(...this.acceptToolCall(rawCall))
          }
        }
      }
      if (rawChoice.finish_reason) this.finishReason = String(rawChoice.finish_reason)
    }
    if (isRecord(value.usage)) chunks.push(this.usage(value.usage))
    return chunks
  }

  markDone(): void {
    this.done = true
  }

  finish(): StreamChunk[] {
    if (this.closed) return []
    this.closed = true
    if (!this.done || !this.finishReason) {
      throw new EaisError('E_TIMEOUT', '模型流在结束标记前中断')
    }
    if (this.tools.size && this.finishReason !== 'tool_calls') {
      throw new EaisError('E_CONTRACT', '工具调用未以 tool_calls 结束')
    }
    const blocks: Array<{ index: number; block: ContentBlock }> = []
    if (this.reasoning) blocks.push({ index: this.reasoning.index, block: { type: 'reasoning', text: this.reasoning.text } })
    if (this.text) blocks.push({ index: this.text.index, block: { type: 'text', text: this.text.text } })
    for (const tool of this.tools.values()) {
      if (!tool.name) throw new EaisError('E_CONTRACT', '工具调用缺少名称')
      try {
        JSON.parse(tool.arguments || '{}')
      } catch {
        throw new EaisError('E_CONTRACT', `工具调用 ${tool.name} 的参数不完整`)
      }
      blocks.push({
        index: tool.index,
        block: { type: 'tool-call', id: tool.id, name: tool.name, arguments: tool.arguments || '{}' },
      })
    }
    const chunks = blocks.sort((a, b) => a.index - b.index)
      .map(({ index, block }) => this.endBlock(index, block))
    chunks.push({ type: 'finish', reason: this.mapFinishReason(this.finishReason) })
    return chunks
  }

  private acceptToolCall(value: unknown): StreamChunk[] {
    if (!isRecord(value) || typeof value.index !== 'number' || !Number.isInteger(value.index)) {
      throw new EaisError('E_CONTRACT', '工具调用缺少有效的 index')
    }
    const upstreamIndex = value.index
    let tool = this.tools.get(upstreamIndex)
    const chunks: StreamChunk[] = []
    if (!tool) {
      if (typeof value.id !== 'string' || !value.id) {
        throw new EaisError('E_CONTRACT', '首个工具调用分片缺少 id')
      }
      tool = { index: this.nextIndex++, upstreamIndex, id: value.id as ToolCallId, arguments: '' }
      this.tools.set(upstreamIndex, tool)
      chunks.push({ type: 'block-start', index: tool.index, blockType: 'tool-call' })
    } else if (typeof value.id === 'string' && value.id && value.id !== tool.id) {
      throw new EaisError('E_CONTRACT', '工具调用在分片中改变了 id')
    }
    let name = tool.name
    if (isRecord(value.function) && typeof value.function.name === 'string' && value.function.name) {
      if (name && name !== value.function.name) throw new EaisError('E_CONTRACT', '工具调用在分片中改变了名称')
      name = value.function.name
      tool.name = name
    }
    const argumentsDelta = isRecord(value.function) && typeof value.function.arguments === 'string'
      ? value.function.arguments
      : ''
    tool.arguments += argumentsDelta
    chunks.push({
      type: 'tool-call-delta', index: tool.index, id: tool.id,
      ...(name ? { name } : {}), argumentsDelta,
    })
    return chunks
  }

  private endBlock(index: number, block: ContentBlock): StreamChunk {
    return { type: 'block-end', index, block }
  }

  private usage(value: Record<string, unknown>): StreamChunk {
    const input = Number(value.prompt_tokens ?? 0)
    const output = Number(value.completion_tokens ?? 0)
    const total = Number(value.total_tokens ?? input + output)
    if (![input, output, total].every(Number.isFinite)) {
      throw new EaisError('E_CONTRACT', '模型用量字段无效')
    }
    return {
      type: 'usage',
      usage: { inputTokens: input, outputTokens: output, totalTokens: total },
    }
  }

  private mapFinishReason(reason: string): Extract<StreamChunk, { type: 'finish' }>['reason'] {
    switch (reason) {
      case 'stop': return { kind: 'stop' }
      case 'tool_calls': return { kind: 'tool-calls' }
      case 'length': return { kind: 'max-tokens' }
      default:
        return { kind: 'error', failure: { code: 'E_CONTRACT', message: `未知模型结束原因：${reason}` } }
    }
  }
}

export async function* readOpenAIStream(response: Response, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  if (!response.body) throw new EaisError('E_UNAVAILABLE', '模型响应没有流式正文')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const assembler = new OpenAIStreamAssembler()
  let buffer = ''
  let eventData: string[] = []
  let eventName: string | undefined
  let completed = false
  const abort = () => void reader.cancel(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })

  function dispatch(name: string | undefined, data: string): StreamChunk[] {
    if (!data) return []
    if (name === 'error') throw streamError(data)
    if (data.trim() === '[DONE]') {
      assembler.markDone()
      return []
    }
    let value: unknown
    try {
      value = JSON.parse(data)
    } catch {
      throw new EaisError('E_CONTRACT', '模型流包含无效 JSON')
    }
    return assembler.accept(value)
  }

  function processLine(line: string): StreamChunk[] {
    if (line === '') {
      const chunks = dispatch(eventName, eventData.join('\n'))
      eventData = []
      eventName = undefined
      return chunks
    }
    if (line.startsWith(':')) return []
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      return []
    }
    if (line.startsWith('data:')) {
      eventData.push(line.slice(5).trimStart())
    }
    return []
  }

  try {
    while (true) {
      if (signal?.aborted) throw signal.reason
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        for (const chunk of processLine(line)) yield chunk
        newline = buffer.indexOf('\n')
      }
    }
    if (signal?.aborted) throw signal.reason
    buffer += decoder.decode()
    if (buffer) {
      for (const line of buffer.split('\n')) {
        for (const chunk of processLine(line)) yield chunk
      }
    }
    for (const chunk of processLine('')) yield chunk
    for (const chunk of assembler.finish()) yield chunk
    completed = true
  } finally {
    signal?.removeEventListener('abort', abort)
    if (completed) reader.releaseLock()
    else await reader.cancel().catch(() => undefined)
  }
}

const STREAM_CODES = new Set([
  'E_POLICY',
  'E_LIMIT',
  'E_UNAVAILABLE',
  'E_TIMEOUT',
  'E_CONTRACT',
  'E_MALFORMED',
])

function streamError(data: string): EaisError {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    throw new EaisError('E_CONTRACT', '模型流错误事件包含无效 JSON')
  }
  const envelope = isRecord(value) && isRecord(value.error) ? value.error : value
  const rawCode = isRecord(envelope) && typeof envelope.code === 'string' ? envelope.code : ''
  const code = rawCode === 'E_CARD_EXPIRED' ? 'E_POLICY' : rawCode
  const message = isRecord(envelope) && typeof envelope.message === 'string' && envelope.message
    ? envelope.message
    : '模型流返回错误'
  return new EaisError(STREAM_CODES.has(code) ? code : 'E_CONTRACT', message)
}
