import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/loading-states'
import { getMonthLabel } from '@/components/ui/month-picker'
import { formatNumber } from '@/lib/format'
import {
  getBPSueldosFullYear,
  updateBPSueldosFullYear,
  type BrandPartner,
} from '@/lib/queries'
import { displaySeniority } from '@/lib/seniority'
import { cn } from '@/lib/utils'

const CURRENT_YEAR = new Date().getFullYear()
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

interface BPSueldosFullYearModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bp: BrandPartner | null
  onSaved?: () => void
}

export function BPSueldosFullYearModal({
  open,
  onOpenChange,
  bp,
  onSaved,
}: BPSueldosFullYearModalProps) {
  const [initial, setInitial] = useState<number[] | null>(null)
  const [values, setValues] = useState<number[]>(() => Array(12).fill(0))
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !bp) return
    let cancelled = false
    setLoading(true)
    setInitial(null)
    void (async () => {
      const rows = await getBPSueldosFullYear(bp.id)
      if (cancelled) return
      const arr = rows.map((r) => r.sueldo)
      setInitial(arr)
      setValues(arr.slice())
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, bp])

  const dirty = useMemo(() => {
    if (!initial) return false
    return values.some((v, i) => v !== initial[i])
  }, [values, initial])

  const setMonthValue = useCallback((i: number, raw: string) => {
    setValues((prev) => {
      const next = prev.slice()
      const parsed = Number(raw)
      next[i] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      return next
    })
  }, [])

  const resetToInitial = useCallback(() => {
    if (initial) setValues(initial.slice())
  }, [initial])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!bp || !dirty || submitting) return
    setSubmitting(true)
    const result = await updateBPSueldosFullYear(
      bp.id,
      MONTHS.map((mes, i) => ({ mes, sueldo: values[i] }))
    )
    setSubmitting(false)
    if (result.success) {
      toast.success('Sueldos guardados')
      setInitial(values.slice())
      onSaved?.()
      onOpenChange(false)
    } else {
      toast.error('No se pudieron guardar los sueldos', {
        description: result.error,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1">
          <DialogHeader>
            <DialogTitle>
              Sueldos mensuales · {bp?.nombre ?? 'BP'} · {CURRENT_YEAR}
            </DialogTitle>
            <DialogDescription>
              {bp && displaySeniority(bp) ? `${displaySeniority(bp)} · ` : ''}
              Editá el sueldo de cada mes. Se guarda en{' '}
              <code className="text-2xs">sueldos</code>.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-[100px_1fr_80px] gap-3 px-2">
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Mes
              </span>
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Sueldo
              </span>
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary text-right">
                Δ vs prev
              </span>
            </div>

            {loading || !initial ? (
              <TableSkeleton rows={6} />
            ) : (
              <div className="flex flex-col">
                {MONTHS.map((mes, i) => {
                  const v = values[i]
                  const prev = i > 0 ? values[i - 1] : null
                  const pct =
                    prev !== null && prev > 0
                      ? ((v - prev) / prev) * 100
                      : null
                  const changed = initial && v !== initial[i]
                  return (
                    <div
                      key={mes}
                      className={cn(
                        'grid grid-cols-[100px_1fr_80px] gap-3 items-center px-2 py-1.5 border-b border-border last:border-0',
                        changed && 'bg-accent-soft/40'
                      )}
                    >
                      <span className="text-sm font-medium">
                        {getMonthLabel(mes)}
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={Number.isFinite(v) ? v : 0}
                        onChange={(e) => setMonthValue(i, e.target.value)}
                      />
                      <span
                        className="text-2xs font-mono tabular-nums text-right"
                        style={{
                          color:
                            pct === null
                              ? 'var(--text-tertiary)'
                              : pct > 0
                                ? 'var(--success)'
                                : pct < 0
                                  ? 'var(--danger)'
                                  : 'var(--text-secondary)',
                        }}
                      >
                        {pct === null
                          ? '—'
                          : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${formatNumber(Math.abs(pct), 1)}%`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={resetToInitial}
              disabled={!dirty || submitting}
              className="mr-auto"
            >
              Deshacer cambios
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!dirty || submitting || loading || !bp}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
