import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getMonthLabel } from '@/components/ui/month-picker'
import { cn } from '@/lib/utils'

export interface MonthNavProps {
  mes: number
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}

/**
 * Centered prev/next stepper for navigating between months without
 * closing the parent modal. Used by both BPDetailModal and
 * ProjectDetailModal in their mensual views.
 */
export function MonthNav({
  mes,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: MonthNavProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        aria-label="Mes anterior"
        onClick={onPrev}
        disabled={!canPrev}
        className={cn(
          'grid place-items-center w-8 h-8 rounded-md border border-border transition-colors',
          canPrev
            ? 'text-primary hover:bg-hover cursor-pointer'
            : 'text-tertiary opacity-40 cursor-not-allowed'
        )}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium min-w-[120px] text-center">
        {getMonthLabel(mes)}
      </span>
      <button
        type="button"
        aria-label="Mes siguiente"
        onClick={onNext}
        disabled={!canNext}
        className={cn(
          'grid place-items-center w-8 h-8 rounded-md border border-border transition-colors',
          canNext
            ? 'text-primary hover:bg-hover cursor-pointer'
            : 'text-tertiary opacity-40 cursor-not-allowed'
        )}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
