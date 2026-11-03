import { useEffect, useState } from 'react'
import { panelStyle, secondaryButtonStyle, secondaryTextStyle } from './styles.js'

export interface PanelProps {
  title: string
  url?: string
  onOpenBrowser?: (url: string) => void | Promise<void>
  onCopyLink?: (url: string) => void | Promise<void>
}

export function Panel({ title, url, onOpenBrowser, onCopyLink }: PanelProps) {
  const [loaded, setLoaded] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setSlow(false)
    if (!url) return
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [url])

  if (!url) {
    return <section style={panelStyle}>此页面已失效，请重新打开。</section>
  }

  return (
    <section style={{ ...panelStyle, display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <strong>{title}</strong>
      {!loaded ? <div style={secondaryTextStyle}>正在加载页面…</div> : null}
      {slow && !loaded ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={secondaryButtonStyle} onClick={() => {
            setLoaded(false)
            setSlow(false)
            const frame = document.querySelector<HTMLIFrameElement>('iframe[data-eais-view]')
            if (frame) frame.src = url
          }}>刷新</button>
          {onOpenBrowser ? <button type="button" style={secondaryButtonStyle} onClick={() => void onOpenBrowser(url)}>在浏览器打开</button> : null}
        </div>
      ) : null}
      <iframe
        data-eais-view
        title={title}
        src={url}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{ flex: 1, width: '100%', minHeight: 320, border: 0, display: loaded ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        {onOpenBrowser ? <button type="button" style={secondaryButtonStyle} onClick={() => void onOpenBrowser(url)}>在浏览器打开</button> : null}
        {onCopyLink ? <button type="button" style={secondaryButtonStyle} onClick={() => void onCopyLink(url)}>复制一次性链接</button> : null}
      </div>
    </section>
  )
}
