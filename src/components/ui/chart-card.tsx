import { type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ChartCardProps {
  /** Height of the chart area in px. Default 220 (matches the mockup). */
  height?: number
  /** Apply a subtle drop-shadow glow filter to children (the line/area). */
  glow?: boolean
  className?: string
  children: ReactNode
}

/**
 * Wrapper for Recharts charts. Provides:
 *  - consistent inner padding,
 *  - a fixed default height,
 *  - an optional `glow` filter that gives the line/area a soft accent halo.
 *
 * Recharts elements inside should reference theme tokens via `var(--accent)`
 * etc. so the chart automatically reflows when the theme changes.
 */
export function ChartCard({
  height = 220,
  glow = true,
  className,
  children,
}: ChartCardProps) {
  const style: CSSProperties = {
    height,
    ...(glow
      ? { filter: 'drop-shadow(0 0 8px var(--accent-glow))' }
      : undefined),
  }
  return (
    <div className={cn('p-5 pb-4', className)}>
      <div style={style} className="w-full">
        {children}
      </div>
    </div>
  )
}

/**
 * Tooltip content style helper for Recharts <Tooltip /> — pass via
 * `contentStyle={chartTooltipStyle}` to keep the elevated/border look.
 */
export const chartTooltipStyle: CSSProperties = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 12,
  color: 'var(--text-primary)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
}
