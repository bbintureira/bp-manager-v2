import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FieldProps {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-2xs font-medium uppercase tracking-wider text-secondary"
      >
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
      {error ? (
        <span className="text-2xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-2xs text-tertiary">{hint}</span>
      ) : null}
    </div>
  )
}
