import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

/**
 * Styled native <select>. Uses a chevron icon overlay; the native control
 * still drives keyboard / a11y / mobile behaviour.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div
      className={cn(
        'relative inline-flex items-center w-full rounded-md border border-border bg-base',
        'text-sm text-primary hover:bg-hover transition-colors',
        'focus-within:ring-2 focus-within:ring-accent/50 focus-within:border-accent'
      )}
    >
      <select
        ref={ref}
        className={cn(
          'appearance-none w-full bg-transparent pl-3 pr-8 h-10 text-sm text-primary outline-none cursor-pointer',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="absolute right-2 w-3.5 h-3.5 text-tertiary pointer-events-none"
      />
    </div>
  )
)
Select.displayName = 'Select'
