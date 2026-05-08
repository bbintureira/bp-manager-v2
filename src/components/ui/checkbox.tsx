import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode
  hint?: ReactNode
  /** Tightens the wrapper for inline use inside a Field row. */
  inline?: boolean
}

/**
 * Native `<input type="checkbox">` styled to match the design tokens.
 * The visual box is rendered as a sibling div whose appearance is driven
 * by the checkbox's :checked state (peer/peer-checked variants).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, hint, inline, id, ...props }, ref) => {
    const inputId = id ?? `cb-${Math.random().toString(36).slice(2, 8)}`
    return (
      <label
        htmlFor={inputId}
        className={cn(
          'flex items-start gap-2.5 cursor-pointer select-none',
          inline ? 'py-1' : 'py-2',
          className
        )}
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="peer sr-only"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid place-items-center w-4 h-4 rounded-sm border border-border bg-base shrink-0',
            'transition-colors',
            'peer-checked:bg-accent peer-checked:border-accent',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50',
            'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed'
          )}
        >
          <Check
            className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
            strokeWidth={3}
          />
        </span>
        {(label || hint) && (
          <div className="flex flex-col gap-0.5 min-w-0">
            {label && (
              <span className="text-sm text-primary font-medium">{label}</span>
            )}
            {hint && <span className="text-2xs text-tertiary">{hint}</span>}
          </div>
        )}
      </label>
    )
  }
)
Checkbox.displayName = 'Checkbox'
