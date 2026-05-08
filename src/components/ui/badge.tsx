import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium tabular-nums',
  {
    variants: {
      variant: {
        accent: 'bg-accent-soft text-accent',
        success: 'bg-success-soft text-success',
        danger: 'bg-danger-soft text-danger',
        warning: 'bg-warning-soft text-warning',
        neutral: 'bg-hover text-secondary',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
