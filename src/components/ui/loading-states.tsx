import { type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

/** Single KPI card skeleton (matches KpiCard's footprint). */
export function KpiCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg px-5 pt-[18px] pb-5 flex flex-col gap-3">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

/** Grid of N KPI skeletons. Defaults to 4 (the standard dashboard layout). */
export function KpiSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </>
  )
}

/** Vertical stack of skeleton bars — used inside Section while a table loads. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="px-5 py-6 flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  )
}

/** Two-line list skeleton (used for Top BPs / lists). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul>
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between px-5 py-3 border-b border-border last:border-0"
        >
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </li>
      ))}
    </ul>
  )
}

export function EmptyState({
  message,
  className,
}: {
  message: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid place-items-center px-5 py-10 text-sm text-tertiary text-center',
        className
      )}
    >
      {message}
    </div>
  )
}

export function ErrorBanner({ message }: { message: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 mb-5 px-4 py-3 rounded-md bg-danger-soft text-danger text-sm"
    >
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
