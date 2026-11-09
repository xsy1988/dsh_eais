import { endpoint, type FetchLike } from '../api.js'
import { EAIS_PROVIDER, EaisError, type EaisMe, type EaisModel } from '../contracts.js'
import {
  LlmAdapter,
  attributionHeaders,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type ReasoningEffortId,
  type StreamChunk,
} from '../llm.js'
import { toOpenAIMessages } from './messages.js'
import { readOpenAIStream } from './stream.js'

/** One current employee-card session. The adapter never caches the token across calls. */
export interface EaisRuntimeSession {
  me: EaisMe
  token: string
}

export interface EaisAdapterOptions {
  me?: EaisMe
  token?: string
  fetchImpl?: FetchLike
  /** Read the live session for every call; the host swaps it without re-registering. */
  readSession?: () => EaisRuntimeSession | undefined
}

export class EaisAdapter extends LlmAdapter {
  private readonly fetchImpl: FetchLike
  private readonly readSession?: () => EaisRuntimeSession | undefined
  private staticSession?: EaisRuntimeSession

  constructor(options: EaisAdapterOptions) {
    super()
    this.fetchImpl = options.fetchImpl ?? fetch
    this.readSession = options.readSession
    if (options.me && options.token) {
      this.staticSession = { me: options.me, token: options.token }
    }
  }

  /** Replace the fallback session used when no live reader is supplied. */
  updateSession(session: EaisRuntimeSession): void {
    this.staticSession = session
  }

  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'EAIS 企业模型' }
  }

  async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const session = this.currentSession(false)
    if (!session) return []
    return session.me.llm.models.map((model) => this.modelInfo(provider, model))
  }

  async resolveModel(provider: string, modelId: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const session = this.currentSession(true)
    const model = this.findModel(session, modelId)
    return {
      ...this.modelInfo(provider, model),
      context: { contextWindow: model.contextWindow },
      ...(model.reasoning ? {
        reasoning: {
          efforts: model.reasoning.map((effort) => ({ id: effort as ReasoningEffortId, name: effort })),
        },
      } : {}),
    }
  }

  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    if (options.provider !== EAIS_PROVIDER) {
      throw new EaisError('E_POLICY', `模型提供方 ${options.provider} 不属于 EAIS 适配器`)
    }
    const session = this.currentSession(true)
    this.findModel(session, options.model)
    const messages = toOpenAIMessages(options.messages, options.system)
    // The server's /me.mcp declaration is the only L1 switch the plugin sees.
    const tools = session.me.mcp ? openAITools(options.tools) : undefined

    const response = await this.fetchImpl(endpoint(session.me.llm.baseURL, '/chat/completions'), {
      method: 'POST',
      credentials: 'omit',
      headers: {
        ...attributionHeaders(),
        ...(options.sessionId === undefined ? {} : { 'X-EAIS-Session-ID': String(options.sessionId) }),
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stop: options.stop,
        reasoning_effort: options.reasoningEffort && String(options.reasoningEffort).toLowerCase() !== 'default'
          ? options.reasoningEffort
          : undefined,
        stream: true,
        stream_options: { include_usage: true },
        n: 1,
        ...(tools ? { tools, tool_choice: 'auto' } : {}),
      }),
      signal: options.signal,
    })
    if (!response.ok) {
      throw await upstreamFailure(response)
    }
    for await (const chunk of readOpenAIStream(response, options.signal)) {
      yield chunk
    }
  }

  private currentSession(required: true): EaisRuntimeSession
  private currentSession(required: false): EaisRuntimeSession | undefined
  private currentSession(required: boolean): EaisRuntimeSession | undefined {
    const session = this.readSession?.() ?? this.staticSession
    if (session?.token) return session
    if (!required) return undefined
    throw new EaisError('E_POLICY', 'EAIS 登录状态不可用，请重新登录')
  }

  private findModel(session: EaisRuntimeSession, modelId: string): EaisModel {
    const model = session.me.llm.models.find((candidate) => candidate.id === modelId)
    if (!model) throw new EaisError('E_POLICY', `模型 ${modelId} 未分配给当前员工`)
    return model
  }

  private modelInfo(provider: string, model: EaisModel): LlmModelInfo {
    return { provider, id: model.id, name: model.name, inputModalities: ['text'] }
  }
}

async function upstreamFailure(response: Response): Promise<EaisError> {
  let code = statusCode(response.status)
  let message = `EAIS 模型调用失败（HTTP ${response.status}）`
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null) {
      const error = 'error' in body && typeof body.error === 'object' && body.error !== null
        ? body.error as Record<string, unknown>
        : body as Record<string, unknown>
      if (typeof error.code === 'string' && error.code) code = normalizeCode(error.code)
      if (typeof error.message === 'string' && error.message) message = error.message
    }
  } catch {
  }
  return new EaisError(code, message, response.status)
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

function openAITools(tools: GenerateOptions['tools']): OpenAITool[] | undefined {
  if (!tools?.length) return undefined
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function normalizeCode(code: string): string {
  return code === 'E_CARD_EXPIRED' ? 'E_POLICY' : code
}

function statusCode(status: number): string {
  switch (status) {
    case 400: return 'E_MALFORMED'
    case 401:
    case 403: return 'E_POLICY'
    case 429: return 'E_LIMIT'
    case 504: return 'E_TIMEOUT'
    case 502: return 'E_CONTRACT'
    case 503: return 'E_UNAVAILABLE'
    default: return status >= 500 ? 'E_UNAVAILABLE' : 'E_CONTRACT'
  }
}
