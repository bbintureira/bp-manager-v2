import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Skeleton } from '@/components/ui/skeleton'

interface AdminRouteProps {
  children: ReactNode
}

/**
 * Like ProtectedRoute, but also requires the user's email to match
 * `VITE_ADMIN_EMAIL`. Non-admins are redirected to /dashboard/proyectos
 * (visible to them) so the admin URL doesn't 404 — it just bounces.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-base">
        <Skeleton className="h-32 w-64" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/dashboard/proyectos" replace />

  return <>{children}</>
}
