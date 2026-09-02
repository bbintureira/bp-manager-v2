import { type ReactNode } from 'react'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Right-aligned slot — typically the page's primary CTA. */
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    // Wraps instead of squeezing: pages with a long action row (export +
    // upload + CTA) used to crush the title down to an ellipsis rather
    // than pushing the buttons onto their own line.
    <div className="flex flex-wrap items-end justify-between mb-7 gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <h1 className="text-3xl font-semibold tracking-title mb-1 truncate text-primary">
          {title}
        </h1>
        {subtitle && (
          <p className="text-base text-secondary truncate">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 ml-auto">{action}</div>}
    </div>
  )
}
