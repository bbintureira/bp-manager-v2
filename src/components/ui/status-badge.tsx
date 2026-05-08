import { cn } from '@/lib/utils'

export type StatusVariant = 'active' | 'idle' | 'over' | 'neutral'

export interface StatusBadgeProps {
  label: string
  variant?: StatusVariant
  className?: string
}

const variantClass: Record<StatusVariant, string> = {
  active: 'bg-success-soft text-success',
  idle: 'bg-warning-soft text-warning',
  over: 'bg-danger-soft text-danger',
  neutral: 'bg-hover text-secondary',
}

/**
 * Small pill badge with a 5px coloured dot in front of the label.
 * Dot inherits the foreground colour via `bg-current`.
 */
export function StatusBadge({
  label,
  variant = 'neutral',
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium',
        variantClass[variant],
        className
      )}
    >
      <span
        aria-hidden
        className="inline-block w-[5px] h-[5px] rounded-full bg-current"
      />
      {label}
    </span>
  )
}
