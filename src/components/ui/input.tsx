import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', onFocus, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      // Select-all on focus for number inputs so the "0" (or any existing
      // value) doesn't fight the user — clicking + typing just replaces.
      onFocus={(e) => {
        if (type === 'number') e.currentTarget.select()
        onFocus?.(e)
      }}
      className={cn(
        'h-10 w-full rounded-md border border-border bg-base px-3 text-sm text-primary',
        'placeholder:text-tertiary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
