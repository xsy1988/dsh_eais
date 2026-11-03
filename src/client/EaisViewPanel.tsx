import { Panel } from './Panel.js'

function panelUrl(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const record = props as Record<string, any>
  const candidates = [
    record.url,
    record.params?.url,
    record.tab?.params?.url,
    record.tab?.navigation?.params?.url,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return undefined
}

export function EaisViewPanel({ props }: { props: unknown }) {
  const url = panelUrl(props)
  return <Panel
    title="EAIS 确认"
    url={url}
    onOpenBrowser={(target) => { window.open(target, '_blank', 'noopener,noreferrer') }}
    onCopyLink={(target) => { void navigator.clipboard?.writeText(target) }}
  />
}
