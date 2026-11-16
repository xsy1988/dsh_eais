import { textOnlyImageText } from '@deepseek-ai/dsh-llm'
import { attributionHeaders, type ContentBlock, type GenerateOptions, type StreamChunk } from './llm.js'
import { endpoint, type FetchLike } from './api.js'
import { EaisError, type EaisMe } from './contracts.js'
import type { HostContext } from './port.js'

interface Session {
  me: EaisMe
  token: string
}

type ImageAttachment = Extract<ContentBlock, { type: 'image' }>['attachment']
type FileAttachment = Extract<ContentBlock, { type: 'file' }>['attachment']

interface AttachmentService {
  readImage(ref: ImageAttachment, signal?: AbortSignal): Promise<{ data: Uint8Array }>
  readFileStream(ref: FileAttachment, signal?: AbortSignal): AsyncIterable<Uint8Array>
}

interface RegisteredAttachment {
  id: string
  status: string
  errorCode?: string
  errorMessage?: string
}

type StreamNext = () => AsyncIterable<StreamChunk>

export interface AttachmentResolver {
  resolvePlaceholder(sessionId: string | undefined, text: string): string | undefined
  resolveAttachment(sessionId: string | undefined, attachmentId: string): string | undefined
}

export class AttachmentBridge implements AttachmentResolver {
  private readonly registrations = new Map<string, string>()
  private readonly projections = new Map<string, string>()

  constructor(
    private readonly ctx: HostContext,
    private readonly readSession: () => Session | undefined,
    private readonly fetchImpl: FetchLike,
  ) {}

  install(): () => void {
    const dispose = this.ctx.on('llm/stream', (options, next) => {
      const request = options as GenerateOptions
      return this.stream(request, next as StreamNext)
    })
    return () => {
      if (typeof dispose === 'function') (dispose as () => void)()
    }
  }

  resolvePlaceholder(sessionId: string | undefined, text: string): string | undefined {
    if (sessionId === undefined) return undefined
    return this.projections.get(`${sessionId}\0${text}`)
  }

  resolveAttachment(sessionId: string | undefined, attachmentId: string): string | undefined {
    if (sessionId === undefined) return undefined
    return this.registrations.get(`${sessionId}\0${attachmentId}`)
  }

  private stream(options: GenerateOptions, next: StreamNext): AsyncIterable<StreamChunk> {
    if (options.provider !== 'eais' || !hasAttachments(options.messages)) return next()
    const session = this.readSession()
    if (!session) return attachmentFailure('E_POLICY', 'EAIS 登录状态不可用，请重新登录')
    if (!session.me.attachments?.enabled) {
      return attachmentFailure('E_POLICY', '当前 EAIS 服务未开放图片或文件输入')
    }
    if (options.sessionId === undefined) {
      return attachmentFailure('E_MALFORMED', '附件请求缺少会话编号')
    }
    return this.prepare(options, session, next)
  }

  private async *prepare(options: GenerateOptions, session: Session, next: StreamNext): AsyncGenerator<StreamChunk> {
    try {
      for (const message of options.messages) {
        if (message.role !== 'user') continue
        for (const block of message.content) {
          if (block.type === 'file') await this.registerFile(block.attachment, options, session)
          if (block.type === 'image') await this.registerImage(block.attachment, options, session)
        }
      }
    } catch (error) {
      const failed = error instanceof EaisError ? error : new EaisError('E_UNAVAILABLE', '附件登记或解析失败')
      yield failureChunk(failed)
      return
    }
    yield* next()
  }

  private async registerFile(ref: FileAttachment, options: GenerateOptions, session: Session): Promise<void> {
    const id = await this.register(ref.attachmentId, ref.name, async () => {
      const service = this.attachmentService()
      const chunks: Uint8Array[] = []
      let size = 0
      for await (const chunk of service.readFileStream(ref, options.signal)) {
        size += chunk.byteLength
        if (size > session.me.attachments!.maxFileBytes) throw new EaisError('E_LIMIT_EXCEEDED', '附件超过服务端大小上限')
        chunks.push(chunk)
      }
      return concat(chunks, size)
    }, options, session)
    const text = this.ctx.llm.fileRequestText?.(ref)
    if (!text) throw new EaisError('E_CONTRACT', 'DSH 无法生成文件引用映射')
    this.projections.set(this.key(options.sessionId, text), id)
  }

  private async registerImage(ref: ImageAttachment, options: GenerateOptions, session: Session): Promise<void> {
    const extension = ref.mediaType.split('/')[1] ?? 'png'
    const name = ref.name || `image.${extension}`
    const id = await this.register(ref.attachmentId, name, async () => {
      const stored = await this.attachmentService().readImage(ref, options.signal)
      return stored.data
    }, options, session)
    this.projections.set(this.key(options.sessionId, textOnlyImageText(ref)), id)
  }

  private async register(
    clientRef: string,
    name: string,
    read: () => Promise<Uint8Array>,
    options: GenerateOptions,
    session: Session,
  ): Promise<string> {
    const sessionId = String(options.sessionId)
    const cacheKey = `${sessionId}\0${clientRef}`
    const cached = this.registrations.get(cacheKey)
    if (cached) return cached
    const data = await read()
    const form = new FormData()
    form.set('client_ref', clientRef)
    form.set('file', new Blob([data.buffer as ArrayBuffer]), name)
    const base = serverBase(session.me)
    const response = await this.fetchImpl(endpoint(base, '/attachments'), {
      method: 'POST',
      credentials: 'omit',
      headers: {
        ...attributionHeaders(),
        authorization: `Bearer ${session.token}`,
        'X-EAIS-Session-ID': sessionId,
        'X-EAIS-Attachment-Ref': clientRef,
      },
      body: form,
      signal: options.signal,
    })
    if (!response.ok) throw await attachmentError(response)
    const registered = await attachmentResponse(response)
    const ready = await this.waitReady(base, registered, options, session)
    this.registrations.set(cacheKey, ready.id)
    return ready.id
  }

  private async waitReady(
    base: string,
    initial: RegisteredAttachment,
    options: GenerateOptions,
    session: Session,
  ): Promise<RegisteredAttachment> {
    let current = initial
    const deadline = Date.now() + 15 * 60_000
    while (current.status === 'uploaded' || current.status === 'extracting') {
      if (Date.now() >= deadline) throw new EaisError('E_UNAVAILABLE', '附件仍在解析，请稍后重试')
      await delay(500, options.signal)
      const response = await this.fetchImpl(endpoint(base, `/attachments/${encodeURIComponent(current.id)}`), {
        credentials: 'omit',
        headers: { authorization: `Bearer ${session.token}`, accept: 'application/json' },
        signal: options.signal,
      })
      if (!response.ok) throw await attachmentError(response)
      current = await attachmentResponse(response)
    }
    if (current.status !== 'ready') {
      throw new EaisError(current.status === 'blocked' ? 'E_POLICY' : 'E_MALFORMED',
        current.errorMessage || '附件未抽取到可用内容')
    }
    return current
  }

  private attachmentService(): AttachmentService {
    const service = this.ctx.get?.<AttachmentService>('attachments')
    if (!service) throw new EaisError('E_UNAVAILABLE', 'DSH 附件读取服务不可用')
    return service
  }

  private key(sessionId: unknown, text: string): string {
    return `${String(sessionId)}\0${text}`
  }
}

function hasAttachments(messages: GenerateOptions['messages']): boolean {
  return messages.some(message => message.role === 'user' && message.content.some(block => block.type === 'image' || block.type === 'file'))
}

function serverBase(me: EaisMe): string {
  const url = new URL(me.llm.baseURL)
  url.pathname = url.pathname.replace(/\/llm\/v1\/?$/, '')
  return url.toString().replace(/\/$/, '')
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

async function attachmentResponse(response: Response): Promise<RegisteredAttachment> {
  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null || !('id' in value) || !('status' in value) ||
    typeof value.id !== 'string' || typeof value.status !== 'string') {
    throw new EaisError('E_API_RESPONSE', 'EAIS 附件响应无效')
  }
  return {
    id: value.id,
    status: value.status,
    ...('errorCode' in value && typeof value.errorCode === 'string' ? { errorCode: value.errorCode } : {}),
    ...('errorMessage' in value && typeof value.errorMessage === 'string' ? { errorMessage: value.errorMessage } : {}),
  }
}

async function attachmentError(response: Response): Promise<EaisError> {
  let message = `附件请求失败（HTTP ${response.status}）`
  let code = response.status === 429 ? 'E_LIMIT' : response.status === 403 ? 'E_POLICY' : 'E_MALFORMED'
  try {
    const value: unknown = await response.json()
    if (typeof value === 'object' && value !== null && 'error' in value) {
      const error = value.error
      if (typeof error === 'object' && error !== null) {
        if ('message' in error && typeof error.message === 'string') message = error.message
        if ('code' in error && typeof error.code === 'string') code = error.code
      }
    }
  } catch {
  }
  return new EaisError(code, message, response.status)
}

function failureChunk(error: EaisError): StreamChunk {
  return {
    type: 'finish', reason: { kind: 'error', failure: { code: error.code, message: error.message, status: error.status } },
  } as StreamChunk
}

async function* attachmentFailure(code: string, message: string): AsyncGenerator<StreamChunk> {
  yield failureChunk(new EaisError(code, message))
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

export function contentBlockText(block: ContentBlock): string {
  return block.type === 'text' ? block.text : ''
}
