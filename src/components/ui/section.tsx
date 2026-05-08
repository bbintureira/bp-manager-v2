import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SectionTab {
  label: ReactNode
  active?: boolean
  onClick?: () => void
}

export interface SectionProps {
  title?: ReactNode
  tabs?: SectionTab[]
  actions?: ReactNode
  /** Remove default padding around `children` (useful for tables / lists). */
  flush?: boolean
  className?: string
  children?: ReactNode
}

/**
 * Generic content wrapper used for charts, lists, and tables. Has an
 * optional header strip with title + tabs/actions on the right.
 */
export function Section({
  title,
  tabs,
  actions,
  flush,
  className,
  children,
}: SectionProps) {
  const hasHeader = Boolean(title || (tabs && tabs.length > 0) || actions)
  return (
    <section
      className={cn(
        'w-full bg-surface border border-border rounded-lg overflow-hidden',
        className
      )}
    >
      {hasHeader && (
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          {title && (
            <h2 className="text-lg font-semibold tracking-snug text-primary">
              {title}
            </h2>
          )}
          <div className="flex items-center gap-3">
            {tabs && tabs.length > 0 && (
              <div className="flex gap-1">
                {tabs.map((tab, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={tab.onClick}
                    className={cn(
                      'text-xs font-medium px-2.5 py-1 rounded-sm transition-colors',
                      tab.active
                        ? 'bg-hover text-primary'
                        : 'text-secondary hover:text-primary hover:bg-hover'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
            {actions}
          </div>
        </header>
      )}
      <div className={cn(!flush && 'p-5')}>{children}</div>
    </section>
  )
}
