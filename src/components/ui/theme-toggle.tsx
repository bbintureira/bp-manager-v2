import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'bp-theme'

type Theme = 'dark' | 'light'

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return 'light'
}

export interface ThemeToggleProps {
  className?: string
  /** When true, render as an icon-only button (sidebar collapsed mode). */
  compact?: boolean
}

/**
 * Toggles `.dark` on <html> and persists the choice in localStorage under
 * `bp-theme`. The default is light; the choice is applied synchronously
 * by an inline script in index.html to avoid FOUC.
 */
export function ThemeToggle({ className, compact }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme())

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, [theme])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const Icon = theme === 'dark' ? Sun : Moon
  const nextLabel = next === 'dark' ? 'Modo oscuro' : 'Modo claro'

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={`Cambiar a ${nextLabel.toLowerCase()}`}
        title={nextLabel}
        className={cn(
          'grid place-items-center w-9 h-9 mx-auto rounded-md',
          'text-secondary hover:text-primary hover:bg-hover transition-colors',
          className
        )}
      >
        <Icon className="w-4 h-4" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Cambiar a ${nextLabel.toLowerCase()}`}
      className={cn(
        'flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm font-medium',
        'text-secondary hover:text-primary hover:bg-hover transition-colors',
        className
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{nextLabel}</span>
    </button>
  )
}
