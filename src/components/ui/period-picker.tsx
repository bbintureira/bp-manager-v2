import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMonthLabel } from '@/components/ui/month-picker'

/**
 * Scope a month-based view can be pointed at: a single month (1-12) or a
 * quarter, which simply aggregates the three months it contains. There's
 * no year dimension in the schema yet — see the schema notes in CLAUDE.md.
 */
export type Periodo =
  | { kind: 'mes'; mes: number }
  | { kind: 'trimestre'; q: number }

export const mesPeriodo = (mes: number): Periodo => ({ kind: 'mes', mes })
export const trimestrePeriodo = (q: number): Periodo => ({
  kind: 'trimestre',
  q,
})

const QUARTERS = [1, 2, 3, 4]

/** Months (1-12) the period covers, ascending. */
export function periodoMeses(p: Periodo): number[] {
  if (p.kind === 'mes') return [p.mes]
  const start = (p.q - 1) * 3 + 1
  return [start, start + 1, start + 2]
}

/** First month of the period — for APIs that still take a single mes
 *  (detail modals, per-month fetches). */
export function periodoPrimerMes(p: Periodo): number {
  return periodoMeses(p)[0]
}

/** Human label: "Marzo" / "Q2 · abr–jun". */
export function periodoLabel(p: Periodo): string {
  if (p.kind === 'mes') return getMonthLabel(p.mes)
  const meses = periodoMeses(p)
  const short = (m: number) => getMonthLabel(m).slice(0, 3).toLowerCase()
  return `Q${p.q} · ${short(meses[0])}–${short(meses[2])}`
}

/** True when the period spans more than one month. */
export function esTrimestre(p: Periodo): boolean {
  return p.kind === 'trimestre'
}

/** Serialized form used as the <select> value: "M3" | "Q2". */
function serialize(p: Periodo): string {
  return p.kind === 'mes' ? `M${p.mes}` : `Q${p.q}`
}

function parse(value: string): Periodo {
  const n = Number(value.slice(1))
  if (value.startsWith('Q')) return trimestrePeriodo(n)
  return mesPeriodo(n)
}

export interface PeriodPickerProps {
  value: Periodo
  onChange: (next: Periodo) => void
  className?: string
  ariaLabel?: string
}

/**
 * Month picker with the four quarters appended. Same native <select>
 * approach as `MonthPicker` (keyboard / screen-reader behaviour for free);
 * `<optgroup>` keeps the two scopes visually separated.
 */
export function PeriodPicker({
  value,
  onChange,
  className,
  ariaLabel = 'Período',
}: PeriodPickerProps) {
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
        value={serialize(value)}
        onChange={(e) => onChange(parse(e.target.value))}
        className="appearance-none bg-transparent pl-3 pr-8 py-1.5 text-sm text-primary outline-none cursor-pointer font-medium"
      >
        <optgroup label="Mes">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={`M${m}`} value={`M${m}`} className="bg-elevated text-primary">
              {getMonthLabel(m)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Trimestre">
          {QUARTERS.map((q) => (
            <option key={`Q${q}`} value={`Q${q}`} className="bg-elevated text-primary">
              {periodoLabel(trimestrePeriodo(q))}
            </option>
          ))}
        </optgroup>
      </select>
      <ChevronDown
        aria-hidden
        className="absolute right-2 w-3.5 h-3.5 text-tertiary pointer-events-none"
      />
    </div>
  )
}
