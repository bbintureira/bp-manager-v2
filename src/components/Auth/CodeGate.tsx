import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Client-side access gate. Compares the typed value against ACCESS_CODE
 * and, on match, persists `bp-gate-unlocked` in localStorage so subsequent
 * visits skip the prompt.
 *
 * SECURITY: this is a friction barrier, not real authentication. The code
 * is shipped in the JS bundle and visible to anyone with DevTools. For
 * sensitive access, use a server-side mechanism.
 */
const ACCESS_CODE = 'bp2026'
const STORAGE_KEY = 'bp-gate-unlocked'

interface CodeGateProps {
  children: ReactNode
}

export function CodeGate({ children }: CodeGateProps) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  })
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  if (unlocked) return <>{children}</>

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (code.trim() === ACCESS_CODE) {
      window.localStorage.setItem(STORAGE_KEY, 'true')
      setUnlocked(true)
    } else {
      setError(true)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-base p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[360px] bg-surface border border-border rounded-lg p-6 flex flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <div
            aria-hidden
            className="grid place-items-center w-10 h-10 rounded-md text-white font-bold text-sm shadow-glow-accent"
            style={{
              background: 'linear-gradient(135deg, var(--accent), #1e40af)',
            }}
          >
            B
          </div>
          <h1 className="text-lg font-semibold tracking-snug mt-1">
            BP Manager
          </h1>
          <p className="text-sm text-secondary">
            Ingresá el código para acceder.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="bp-gate-code"
            className="text-2xs font-medium uppercase tracking-wider text-secondary"
          >
            Código
          </label>
          <Input
            id="bp-gate-code"
            type="password"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              if (error) setError(false)
            }}
            placeholder="••••••"
            aria-invalid={error || undefined}
            aria-describedby={error ? 'bp-gate-error' : undefined}
          />
          {error && (
            <span id="bp-gate-error" className="text-2xs text-danger">
              Código incorrecto.
            </span>
          )}
        </div>

        <Button type="submit" disabled={!code.trim()}>
          Acceder
        </Button>
      </form>
    </div>
  )
}
