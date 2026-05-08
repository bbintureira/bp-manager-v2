import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { ADMIN_EMAIL, supabase, type UsuarioRow } from '@/lib/supabase'

const PROFILE_CACHE_KEY = 'bp-userId'

export interface AuthContextValue {
  user: User | null
  profile: UsuarioRow | null
  /** True iff the user's email matches `VITE_ADMIN_EMAIL`. */
  isAdmin: boolean
  loading: boolean
  error: string | null
  loginWithGoogle: () => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Auth wrapper around Supabase Auth + Google OAuth.
 *
 * Flow:
 *  1. User clicks "Sign in with Google" → `signInWithOAuth({ provider: 'google' })`.
 *  2. Browser bounces through Google + Supabase and returns to the app
 *     with `?code=...`. Supabase client (with `detectSessionInUrl: true`)
 *     exchanges the code for a session and emits `SIGNED_IN`.
 *  3. We hydrate `user` + (best-effort) `profile` from the `usuarios`
 *     table by lowercased email. There is NO allowlist gate — any
 *     successful Google sign-in is accepted.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UsuarioRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tracks the latest in-flight session handler so a slow profile fetch
  // can't clobber a newer sign-in/sign-out.
  const tokenRef = useRef(0)

  const isAdmin = useMemo(() => {
    if (!user?.email || !ADMIN_EMAIL) return false
    return user.email.toLowerCase() === ADMIN_EMAIL
  }, [user])

  const loadProfile = useCallback(async (sessionUser: User) => {
    const { data, error: dbError } = await supabase
      .from('usuarios')
      .select('id, email, nombre, created_at')
      .eq('email', (sessionUser.email ?? '').toLowerCase())
      .maybeSingle<UsuarioRow>()
    if (dbError) {
      console.warn('[auth] profile lookup failed:', dbError.message)
      return null
    }
    return data ?? null
  }, [])

  const handleSession = useCallback(
    async (session: Session | null) => {
      const token = ++tokenRef.current
      const sessionUser = session?.user ?? null

      if (!sessionUser) {
        setUser(null)
        setProfile(null)
        try {
          localStorage.removeItem(PROFILE_CACHE_KEY)
        } catch {
          // ignore
        }
        return
      }

      setUser(sessionUser)
      const p = await loadProfile(sessionUser)
      if (token !== tokenRef.current) return
      setProfile(p)
      try {
        if (p?.id) localStorage.setItem(PROFILE_CACHE_KEY, p.id)
      } catch {
        // ignore
      }
    },
    [loadProfile]
  )

  // Hydrate on mount + subscribe to auth state changes.
  useEffect(() => {
    let cancelled = false

    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      await handleSession(data.session)
      if (!cancelled) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION is already covered by getSession() above.
      if (event === 'INITIAL_SESSION') return
      void handleSession(session)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [handleSession])

  const loginWithGoogle = useCallback<AuthContextValue['loginWithGoogle']>(async () => {
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })
    if (oauthError) {
      const msg = oauthError.message || 'No se pudo iniciar sesión.'
      setError(msg)
      return { ok: false, error: msg }
    }
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      isAdmin,
      loading,
      error,
      loginWithGoogle,
      logout,
    }),
    [user, profile, isAdmin, loading, error, loginWithGoogle, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
