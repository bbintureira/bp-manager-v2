import { cn } from '@/lib/utils'

export type ViewMode = 'monthly' | 'annual'

export interface ViewToggleProps {
  value: ViewMode
  onChange: (next: ViewMode) => void
  monthlyLabel?: string
  annualLabel?: string
  className?: string
}

/**
 * Two-button pill that toggles between monthly and annual views. Used in
 * the topbar of the Proyectos / BrandPartners dashboards.
 */
export function ViewToggle({
  value,
  onChange,
  monthlyLabel = 'Mes',
  annualLabel = 'Anual',
  className,
}: ViewToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Vista"
      className={cn(
        'inline-flex p-0.5 rounded-md border border-border bg-base text-sm',
        className
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'monthly'}
        onClick={() => onChange('monthly')}
        className={cn(
          'px-3 py-1 rounded text-2xs font-medium uppercase tracking-wider transition-colors',
          value === 'monthly'
            ? 'bg-surface text-primary shadow-sm'
            : 'text-tertiary hover:text-primary'
        )}
      >
        {monthlyLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'annual'}
        onClick={() => onChange('annual')}
        className={cn(
          'px-3 py-1 rounded text-2xs font-medium uppercase tracking-wider transition-colors',
          value === 'annual'
            ? 'bg-surface text-primary shadow-sm'
            : 'text-tertiary hover:text-primary'
        )}
      >
        {annualLabel}
      </button>
    </div>
  )
}
