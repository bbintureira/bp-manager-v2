import { cn } from '@/lib/utils'

export interface UtilizationBarProps {
  /** Percentage value, 0–110+. Variant auto-derived. */
  value: number
  /** Track width in pixels (default 120). */
  width?: number
  className?: string
}

function variantFor(value: number): 'ok' | 'warn' | 'over' {
  if (value > 100) return 'over'
  if (value >= 90) return 'warn'
  return 'ok'
}

const fillClass = {
  ok: 'bg-accent',
  warn: 'bg-warning',
  over: 'bg-danger',
} as const

/**
 * Inline progress bar with mono number on the right. Values >100 visually
 * fill the track to 100% (because of overflow-hidden) but the number still
 * shows the real value.
 */
export function UtilizationBar({
  value,
  width = 120,
  className,
}: UtilizationBarProps) {
  const v = variantFor(value)
  return (
    <div
      className={cn('inline-flex items-center gap-2 align-middle', className)}
      style={{ width }}
    >
      <div className="flex-1 h-[5px] bg-hover rounded-sm overflow-hidden">
        <div
          className={cn('h-full rounded-sm transition-[width] duration-300', fillClass[v])}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="font-mono text-2xs text-secondary tabular-nums w-9 text-right">
        {value}%
      </span>
    </div>
  )
}
