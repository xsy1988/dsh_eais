export type Density = 'standard' | 'compact'

export interface TablePrefs {
  order: string[]
  hidden: string[]
  density: Density
  pageSize: number
}

const PREFIX = 'eais.table.'

function storageKey(action: string, field: string): string {
  return `${PREFIX}${action || 'view'}.${field}`
}

export function readPrefs(action: string): Partial<TablePrefs> {
  const order = readArray(action, 'order')
  const hidden = readArray(action, 'hidden')
  const density = readString(action, 'density') === 'compact' ? 'compact' : 'standard'
  const pageSize = Number(readString(action, 'pageSize'))
  return {
    ...(order ? { order } : {}),
    ...(hidden ? { hidden } : {}),
    density,
    ...(Number.isFinite(pageSize) && pageSize > 0 ? { pageSize } : {}),
  }
}

export function writePrefs(action: string, prefs: TablePrefs): void {
  write(action, 'order', JSON.stringify(prefs.order))
  write(action, 'hidden', JSON.stringify(prefs.hidden))
  write(action, 'density', prefs.density)
  write(action, 'pageSize', String(prefs.pageSize))
}

export function clearPrefs(action: string): void {
  for (const field of ['order', 'hidden', 'density', 'pageSize']) {
    try {
      window.localStorage.removeItem(storageKey(action, field))
    } catch {
      // Storage can be unavailable; in-memory state still applies.
    }
  }
}

export function mergeOrder(saved: string[] | undefined, defaults: string[]): string[] {
  if (!saved || saved.length === 0) return defaults
  const known = new Set(defaults)
  const kept = saved.filter((key, index) => known.has(key) && saved.indexOf(key) === index)
  const rest = defaults.filter((key) => !kept.includes(key))
  return [...kept, ...rest]
}

export function moveKey(order: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return order
  const next = order.slice()
  const [key] = next.splice(from, 1)
  if (key === undefined) return order
  next.splice(to, 0, key)
  return next
}

function readArray(action: string, field: string): string[] | undefined {
  try {
    const raw = window.localStorage.getItem(storageKey(action, field))
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : undefined
  } catch {
    return undefined
  }
}

function readString(action: string, field: string): string | undefined {
  try {
    return window.localStorage.getItem(storageKey(action, field)) ?? undefined
  } catch {
    return undefined
  }
}

function write(action: string, field: string, value: string): void {
  try {
    window.localStorage.setItem(storageKey(action, field), value)
  } catch {
    // Ignore storage failures; the current session keeps working.
  }
}
