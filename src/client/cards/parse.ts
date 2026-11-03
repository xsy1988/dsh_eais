import type { CardColumn, CardPayload, DraftField } from './types.js'

export function toolText(block: unknown): string {
  if (!block || typeof block !== 'object') return ''
  const record = block as Record<string, unknown>
  const content = record.content
  if (!Array.isArray(content)) return ''
  return content
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object' && typeof (entry as { text?: unknown }).text === 'string') {
        return (entry as { text: string }).text
      }
      return ''
    })
    .join('\n')
}

export function parseCard(text: string): CardPayload | undefined {
  if (!text) return undefined
  const start = text.indexOf('{')
  if (start < 0) return undefined
  for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
    const candidate = text.slice(start, end + 1)
    try {
      const parsed = JSON.parse(candidate) as Partial<CardPayload>
      if (parsed && parsed.eais === 'card/v1' && typeof parsed.kind === 'string') {
        return parsed as CardPayload
      }
    } catch {
      // Keep shrinking until a parseable object is found.
    }
  }
  return undefined
}

export function cardFromBlock(block: unknown): CardPayload | undefined {
  return parseCard(toolText(block))
}

export function isStatusBooleanLabel(label: string): boolean {
  return /状态|启停|启用|在线|有效|可用|激活/.test(label)
}

export function booleanText(label: string, value: unknown): string | undefined {
  const status = isStatusBooleanLabel(label)
  if (value === true || value === 'true') return status ? '正常' : '是'
  if (value === false || value === 'false') return status ? '关闭' : '否'
  return undefined
}

export function formatCell(column: CardColumn, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const boolean = booleanText(column.label, value)
  if (boolean !== undefined) return boolean
  if (column.type === 'datetime' || column.type === 'date') {
    const date = new Date(String(value))
    if (!Number.isNaN(date.getTime())) {
      const pad = (input: number) => String(input).padStart(2, '0')
      const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      return column.type === 'date' ? base : `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }
  }
  if (column.enum && typeof value === 'string') {
    const found = column.enum.find((candidate) => candidate.value === value)
    if (found) return found.label
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  const text = String(value)
  return column.unit ? `${text} ${column.unit}` : text
}

export function primaryColumns(columns: CardColumn[], keep: string[] | undefined, limit: number): CardColumn[] {
  if (keep && keep.length > 0) {
    const chosen = keep
      .map((key) => columns.find((column) => column.key === key))
      .filter((column): column is CardColumn => column !== undefined)
    if (chosen.length > 0) return chosen.slice(0, limit)
  }
  return columns.slice(0, limit)
}

export function fieldValue(field: DraftField): string {
  const value = field.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function paramsFromFields(fields: DraftField[], values: Record<string, string>): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = values[field.name] ?? ''
    if (raw === '') continue
    const parsed = coerce(field.type, raw)
    assign(params, field.name, parsed)
  }
  return params
}

function coerce(type: string, value: string): unknown {
  switch (type) {
    case 'integer': {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? Math.trunc(parsed) : value
    }
    case 'number': {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : value
    }
    case 'boolean':
      return value === 'true'
    case 'array':
    case 'object':
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    default:
      return value
  }
}

function assign(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let current = target
  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index]!
    const next = current[part]
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]!] = value
}

export interface EaisAddress {
  kind: 'dataset' | 'confirm'
  id: string
}

export function parseAddress(address: string | undefined): EaisAddress | undefined {
  if (!address) return undefined
  const match = /^dsh-resource:\/\/eais\/(dataset|confirm)\/([A-Za-z0-9_-]+)$/.exec(address)
  if (!match) return undefined
  return { kind: match[1] as 'dataset' | 'confirm', id: match[2]! }
}

export function addressOf(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const record = props as Record<string, any>
  const candidates = [
    record.tab?.navigation?.address,
    record.tab?.address,
    record.tab?.contentId,
    record.address,
    record.navigation?.address,
    record.params?.address,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return undefined
}

export function navigationOf(props: unknown): Record<string, unknown> {
  if (!props || typeof props !== 'object') return {}
  const record = props as Record<string, any>
  const params = record.tab?.navigation?.params ?? record.navigation?.params ?? record.params
  return params && typeof params === 'object' ? params as Record<string, unknown> : {}
}

export function draftTitle(draft: { action_name?: string; action: string }): string {
  return draft.action_name || draft.action
}
export function actionTitle(card: { action_name?: string; action: string }): string {
  return card.action_name || card.action
}
