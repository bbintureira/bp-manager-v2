import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface KpiDelta {
  value: string
  direction: 'up' | 'down'
}

export interface KpiCardProps {
  label: ReactNode
  value: ReactNode
  delta?: KpiDelta
  meta?: ReactNode
  /** Render value with monospace font (good for raw numbers/codes). */
  mono?: boolean
  className?: string
}

/**
 * Big metric card for the dashboard. Has a subtle gradient line on top
 * (`linear-gradient(90deg, transparent, var(--border-strong), transparent)`)
 * to give the surface a sense of depth without an extra border.
 */
export function KpiCard({
  label,
  value,
  delta,
  meta,
  mono,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-surface border border-border rounded-lg',
        'px-5 pt-[18px] pb-5',
        className
      )}
    >
      {/* top gradient hairline */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--border-strong), transparent)',
        }}
      />

      <div className="text-xs font-medium uppercase tracking-wider text-secondary mb-2.5">
        {label}
      </div>

      <div
        className={cn(
          'text-4xl font-semibold leading-[1.1] tracking-tight tabular-nums mb-1.5',
          mono && 'font-mono'
        )}
      >
        {value}
      </div>

      {(delta || meta) && (
        <div className="flex items-center gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm font-medium tabular-nums',
                delta.direction === 'up'
                  ? 'bg-success-soft text-success'
                  : 'bg-danger-soft text-danger'
              )}
            >
              <span aria-hidden>{delta.direction === 'up' ? '↑' : '↓'}</span>
              {delta.value}
            </span>
          )}
          {meta && <span className="text-tertiary">{meta}</span>}
        </div>
      )}
    </div>
  )
}
