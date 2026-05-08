import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Required for OAuth callbacks: Supabase reads the `?code=...` PKCE
    // param from the URL on load and exchanges it for a session.
    detectSessionInUrl: true,
    storageKey: 'bp-supabase-auth',
  },
})

/** Admin email (for client-side `isAdmin` checks). RLS in Postgres has the
 * matching policy server-side — keep both in sync. */
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? '').toLowerCase()

export interface UsuarioRow {
  id: string
  email: string
  nombre: string
  created_at: string
}
