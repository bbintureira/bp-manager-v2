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
  /** Full/precise value to expose on hover (native browser tooltip).
   *  Use this when `value` is a compact form like "$252,5M" so the
   *  reader can still pull up the exact "$252.553.853" via tooltip. */
  fullValue?: string
  className?: string
}

/** If value is a primitive, expose its full text on hover via the native
 *  title attribute — useful when the cell truncates with ellipsis. */
function valueTitle(v: ReactNode): string | undefined {
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  return undefined
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
  fullValue,
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
        title={fullValue ?? valueTitle(value)}
        className={cn(
          // Fluid font-size scales with viewport width between 22px and
          // 40px. Combined with `truncate` + `title`, long currency
          // strings shrink first, then fall back to ellipsis with the
          // full value visible on hover.
          'font-semibold leading-[1.1] tracking-tight tabular-nums mb-1.5',
          'text-[clamp(22px,_2.2vw_+_8px,_40px)] truncate',
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
