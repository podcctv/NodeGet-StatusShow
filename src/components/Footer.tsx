import { useEffect, useState } from 'react'

const REPO = 'https://github.com/NodeSeekDev/NodeGet-StatusShow'
const FLANKER_REPO = 'https://github.com/podcctv/NodeGet-StatusShow'
const PKG_URL = 'https://raw.githubusercontent.com/podcctv/NodeGet-StatusShow/main/package.json'

export function Footer({ text }: { text?: string }) {
  const [latest, setLatest] = useState<string | null>(null)

  useEffect(() => {
    fetch(PKG_URL)
      .then(r => (r.ok ? r.json() : null))
      .then(j => j?.version && setLatest(String(j.version)))
      .catch(() => {})
  }, [])

  const outdated = latest != null && latest !== __APP_VERSION__

  return (
    <footer className="border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-end gap-4 text-xs text-muted-foreground">
        <span>
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
            {text || 'Powered by NodeGet'}
          </a>
          {' & '}
          <a href={FLANKER_REPO} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
            Flanker
          </a>
        </span>
        <span>
          v{__APP_VERSION__}
          {outdated && (
            <a href={`${FLANKER_REPO}/releases`} target="_blank" rel="noreferrer" className="ml-1 text-destructive">
              (Need Update)
            </a>
          )}
        </span>
      </div>
    </footer>
  )
}
