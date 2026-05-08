import { type ReactNode } from 'react'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Right-aligned slot — typically the page's primary CTA. */
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-7 gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-title mb-1 truncate text-primary">
          {title}
        </h1>
        {subtitle && (
          <p className="text-base text-secondary truncate">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
