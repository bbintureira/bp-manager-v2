import { useEffect, useState } from 'react'
import { Toaster as SonnerToaster } from 'sonner'

type Theme = 'light' | 'dark'

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Sonner toaster wrapper that mirrors the app's `.dark` class on <html>.
 * We watch for class changes via MutationObserver so toggling the theme
 * doesn't leave stale-coloured toasts.
 */
export function Toaster() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    const html = document.documentElement
    const observer = new MutationObserver(() => setTheme(readTheme()))
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        },
      }}
    />
  )
}
