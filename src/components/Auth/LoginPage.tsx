import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

const HOME = '/dashboard/proyectos'

/**
 * Full-page sign-in. The only auth method is Google OAuth — any
 * successful sign-in is accepted (no allowlist enforcement).
 */
export function LoginPage() {
  const { user, loading: authLoading, loginWithGoogle } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already authed? Bounce to dashboard. Skip while initial session is
  // still hydrating to avoid flashing the login UI.
  if (!authLoading && user) {
    return <Navigate to={HOME} replace />
  }

  async function onSignIn() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const result = await loginWithGoogle()
    if (!result.ok) {
      setSubmitting(false)
      setError(result.error)
    }
    // On success the browser navigates away to Google; no further work here.
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 py-10 bg-base">
      <div className="w-full max-w-[380px] flex flex-col gap-7">
        <Brand />

        <div
          className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-5"
          role="region"
          aria-label="Iniciar sesión"
        >
          <header className="flex flex-col gap-1 text-center">
            <h1 className="text-xl font-semibold tracking-snug">
              Iniciar sesión
            </h1>
            <p className="text-sm text-secondary">
              Accedé con tu cuenta de Google.
            </p>
          </header>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onSignIn}
            disabled={submitting}
            className="w-full justify-center"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Redirigiendo a Google…
              </>
            ) : (
              <>
                <GoogleLogo className="w-4 h-4" />
                Continuar con Google
              </>
            )}
          </Button>

          {error && (
            <div
              role="alert"
              className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-md"
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center justify-center gap-3">
      <div
        className="grid place-items-center w-10 h-10 rounded-md text-white font-bold text-lg shadow-glow-accent"
        style={{
          background: 'linear-gradient(135deg, var(--accent), #1e40af)',
        }}
        aria-hidden
      >
        B
      </div>
      <span className="text-xl font-semibold tracking-snug">BP Manager</span>
    </div>
  )
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.836.86-3.048.86-2.345 0-4.328-1.584-5.036-3.711H.957v2.331A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.655 3.58 9 3.58z"
      />
    </svg>
  )
}
