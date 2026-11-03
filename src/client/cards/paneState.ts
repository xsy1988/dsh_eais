export interface PaneParams {
  token?: string
  title?: string
  action?: string
  columns?: unknown
  display_columns?: unknown
  total?: number
  rows_returned?: number
  complete?: boolean
}

// Navigation params are not persisted by the dock layout. Session storage keeps
// the scoped card token and title alive across a reload for this browser tab;
// the token itself still expires on the server.
export function rememberPane(address: string | undefined, params: PaneParams): void {
  if (!address) return
  try {
    window.sessionStorage.setItem(key(address), JSON.stringify(params))
  } catch {
    // Storage can be unavailable; the page still works until reload.
  }
}

export function recallPane(address: string | undefined): PaneParams {
  if (!address) return {}
  try {
    const raw = window.sessionStorage.getItem(key(address))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as PaneParams : {}
  } catch {
    return {}
  }
}

export function mergePaneParams(address: string | undefined, params: Record<string, unknown>): PaneParams {
  return { ...recallPane(address), ...params } as PaneParams
}

export function recallPaneTitle(address: string | undefined): string | undefined {
  const title = recallPane(address).title
  return typeof title === 'string' && title ? title : undefined
}

function key(address: string): string {
  return `eais.pane.${address}`
}
