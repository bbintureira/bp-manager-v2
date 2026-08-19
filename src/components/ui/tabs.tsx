import { cn } from '@/lib/utils'

export interface TabItem<T extends string> {
  key: T
  label: string
}

export interface TabsProps<T extends string> {
  value: T
  onChange: (next: T) => void
  items: TabItem<T>[]
  className?: string
  ariaLabel?: string
}

/**
 * Underlined tab strip used at page level (above the main table). Section
 * headers have their own tab affordance — this one is for switching the
 * whole body of a page.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  ariaLabel,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex items-center gap-1 mb-4 border-b border-border',
        className
      )}
    >
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          type="button"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            value === it.key
              ? 'border-accent text-accent'
              : 'border-transparent text-secondary hover:text-primary'
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
