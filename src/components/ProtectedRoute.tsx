import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Skeleton } from '@/components/ui/skeleton'

interface ProtectedRouteProps {
  children: ReactNode
}

/**
 * Gate that redirects unauthenticated users to /login (preserving the
 * intended destination via location.state.from), and shows a skeleton
 * placeholder while the initial session hydration is in flight.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <FullPageSkeleton />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}

function FullPageSkeleton() {
  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen">
      {/* Sidebar skeleton */}
      <aside className="bg-surface border-r border-border p-5 flex flex-col gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-20 mt-3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-20 mt-3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </aside>
      <div className="flex flex-col">
        <div className="h-14 border-b border-border bg-surface" />
        <div className="p-8 flex flex-col gap-6">
          <Skeleton className="h-9 w-72" />
          <div className="grid grid-cols-4 gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  )
}
