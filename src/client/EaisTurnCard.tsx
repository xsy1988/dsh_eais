import { Card, extractViewIds } from './Card.js'

export function collectText(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value
  if (depth > 6 || value === null || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map((entry) => collectText(entry, depth + 1)).join('\n')
  if (value instanceof Map) {
    return [...value.values()].map((entry) => collectText(entry, depth + 1)).join('\n')
  }
  const record = value as Record<string, unknown>
  const parts: string[] = []
  for (const key of ['text', 'content', 'message', 'turn', 'messages', 'parts', 'result', 'data', 'events', 'blocks', 'calls', 'items']) {
    if (key in record) {
      const found = collectText(record[key], depth + 1)
      if (found) parts.push(found)
    }
  }
  return parts.join('\n')
}

function viewIds(props: unknown): string[] {
  if (!props || typeof props !== 'object') return []
  const turn = (props as Record<string, unknown>).turn
  if (turn && typeof turn === 'object') {
    const data = (turn as Record<string, unknown>).data as { get?: (key: string) => unknown } | undefined
    const record = data?.get?.('eais-views') as { views?: string[] } | undefined
    if (record?.views?.length) return record.views
  }
  return extractViewIds(collectText(props))
}

export function EaisTurnCard({ props, onOpen }: {
  props: unknown
  onOpen: (viewId: string) => void | Promise<void>
}) {
  const ids = viewIds(props)
  if (ids.length === 0) return null
  return (
    <>
      {ids.map((viewId) => (
        <Card key={viewId} text={`[[eais-view:${viewId}]]`} onOpen={onOpen} />
      ))}
    </>
  )
}
