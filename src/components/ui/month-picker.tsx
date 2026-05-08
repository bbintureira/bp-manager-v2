import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

export interface MonthPickerProps {
  /** Selected month (1-12). */
  value: number
  onChange: (month: number) => void
  className?: string
  ariaLabel?: string
}

/**
 * Plain styled <select> for picking a month (1-12). Uses a native control
 * for keyboard / screen-reader behaviour for free; we just style the
 * wrapper and overlay a chevron.
 */
export function MonthPicker({
  value,
  onChange,
  className,
  ariaLabel = 'Mes',
}: MonthPickerProps) {
  return (
    <div
      className={cn(
        'relative inline-flex items-center rounded-md border border-border bg-base',
        'text-sm text-primary hover:bg-hover transition-colors',
        'focus-within:ring-2 focus-within:ring-accent/50 focus-within:border-accent',
        className
      )}
    >
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="appearance-none bg-transparent pl-3 pr-8 py-1.5 text-sm text-primary outline-none cursor-pointer font-medium"
      >
        {MONTHS.map((label, i) => (
          <option key={i} value={i + 1} className="bg-elevated text-primary">
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="absolute right-2 w-3.5 h-3.5 text-tertiary pointer-events-none"
      />
    </div>
  )
}

export function getMonthLabel(month: number): string {
  return MONTHS[Math.min(Math.max(month - 1, 0), 11)]
}
