import { EaisError } from '../contracts.js'
import type { ContentBlock, RequestMessage, ToolCallId } from '../port.js'
import type { AttachmentResolver } from '../attachments.js'

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reasoning_content?: string
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  attachments?: { id: string }[]
}

/**
 * L1 tool history is forwarded as OpenAI `tool_calls` / tool results. Images and
 * files returned by tools become metadata-only text so replaying a tool result
 * cannot poison the session. Tool additions/removals are refused. A tool result is
 * accepted only when it answers a tool call that appeared earlier.
 */
export function toOpenAIMessages(
  messages: readonly RequestMessage[],
  system?: string,
  attachments?: AttachmentResolver,
  sessionId?: string,
): OpenAIMessage[] {
  const output: OpenAIMessage[] = []
  if (system) output.push({ role: 'system', content: system })
  const knownCalls = new Set<string>()

  for (const message of messages) {
    if (message.role === 'developer') {
      throw new EaisError('E_MALFORMED', 'L0 不支持工具增删消息，不能把开发者消息转发给模型')
    }
    if (message.role === 'tool') {
      const callId = message.toolCallId
      if (!callId || !knownCalls.has(callId)) {
        throw new EaisError('E_MALFORMED', '工具结果必须对应既有的工具调用历史')
      }
      output.push({
        role: 'tool',
        tool_call_id: callId,
        content: toolText(message.content),
      })
      continue
    }
    if (message.role === 'assistant') {
      ensureTextOnly(message.content, true)
      const reasoning = message.content
        .filter((block) => block.type === 'reasoning')
        .map((block) => (block as Extract<ContentBlock, { type: 'reasoning' }>).text)
        .join('')
      const toolCalls = openAIToolCalls(message.content)
      for (const call of toolCalls) knownCalls.add(call.id)
      output.push({
        role: 'assistant',
        content: plainText(message.content),
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      })
      continue
    }
    if (message.role === 'user' && attachments) ensureUserContent(message.content)
    else ensureTextOnly(message.content, false)
    const resolved = message.role === 'user' && attachments
      ? resolveAttachments(message.content, attachments, sessionId)
      : { content: plainText(message.content), references: [] }
    output.push({
      role: message.role === 'user' ? 'user' : 'system',
      content: resolved.content,
      ...(resolved.references.length ? { attachments: resolved.references.map(id => ({ id })) } : {}),
    })
  }
  return output
}

function toolText(blocks: readonly ContentBlock[]): string {
  const output: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        output.push(block.text)
        break
      case 'reasoning':
        break
      case 'image':
        output.push(`[工具返回图片：${block.attachment.mediaType}，${block.attachment.width}×${block.attachment.height} px]`)
        break
      case 'file':
        output.push(`[工具返回文件：${block.attachment.name}，${block.attachment.bytes} bytes]`)
        break
      default:
        throw new EaisError('E_MALFORMED', '工具结果包含不支持的内容类型')
    }
  }
  return output.join('')
}

function ensureTextOnly(blocks: readonly ContentBlock[], assistant: boolean): void {
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
      case 'reasoning':
        break
      case 'tool-call':
        if (!assistant) throw new EaisError('E_MALFORMED', '工具调用只能出现在助手消息中')
        break
      case 'image':
        throw new EaisError('E_MALFORMED', '当前版本不支持图片输入，请改用文字描述或文件摘要；图片不会被静默丢弃')
      case 'file':
        throw new EaisError('E_MALFORMED', '当前版本不支持文件输入，请先粘贴文件内容或摘要；文件不会被静默丢弃')
      case 'tool-addition':
      case 'tool-removal':
        throw new EaisError('E_MALFORMED', 'L0 不支持工具变更消息')
      default:
        throw new EaisError('E_MALFORMED', 'L0 遇到未知的消息内容类型')
    }
  }
}

function ensureUserContent(blocks: readonly ContentBlock[]): void {
  for (const block of blocks) {
    if (!['text', 'image', 'file'].includes(block.type)) {
      throw new EaisError('E_MALFORMED', '用户消息包含不支持的内容类型')
    }
  }
}

function resolveAttachments(
  blocks: readonly ContentBlock[],
  resolver: AttachmentResolver,
  sessionId: string | undefined,
): { content: string, references: string[] } {
  const content: string[] = []
  const references: string[] = []
  for (const block of blocks) {
    if (block.type === 'image' || block.type === 'file') {
      const id = resolver.resolveAttachment(sessionId, String(block.attachment.attachmentId))
      if (!id) throw new EaisError('E_MALFORMED', '附件尚未完成 EAIS 登记或当前会话无权使用')
      references.push(id)
      continue
    }
    if (block.type !== 'text') continue
    const id = resolver.resolvePlaceholder(sessionId, block.text)
    if (id) references.push(id)
    else content.push(block.text)
  }
  return { content: content.join(''), references }
}

function openAIToolCalls(blocks: readonly ContentBlock[]): OpenAIToolCall[] {
  const calls: OpenAIToolCall[] = []
  for (const block of blocks) {
    if (block.type !== 'tool-call') continue
    if (!block.id || !block.name) {
      throw new EaisError('E_MALFORMED', '工具调用缺少 id 或名称')
    }
    try {
      JSON.parse(block.arguments)
    } catch {
      throw new EaisError('E_MALFORMED', `工具调用 ${block.name} 的参数不是有效 JSON`)
    }
    calls.push({
      id: block.id,
      type: 'function',
      function: { name: block.name, arguments: block.arguments },
    })
  }
  return calls
}

function plainText(blocks: readonly ContentBlock[]): string {
  return blocks.map((block) => block.type === 'text' ? block.text : '').join('')
}

export function toolCallId(value: string): ToolCallId {
  return value as ToolCallId
}
