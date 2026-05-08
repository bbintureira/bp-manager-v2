import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
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
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/loading-states'
import { getMonthLabel } from '@/components/ui/month-picker'
import { formatNumber } from '@/lib/format'
import {
  getProjectHonorarioFullYear,
  updateProjectHonorarioFullYear,
  type Proyecto,
} from '@/lib/queries'
import { cn } from '@/lib/utils'

const CURRENT_YEAR = new Date().getFullYear()
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
type Quarter = 'T0' | 'T1' | 'T2' | 'T3'

const QUARTER_FOR_MONTH: Quarter[] = [
  'T0', 'T0', 'T0', // Ene-Mar
  'T1', 'T1', 'T1', // Abr-Jun
  'T2', 'T2', 'T2', // Jul-Sep
  'T3', 'T3', 'T3', // Oct-Dic
]

const QUARTER_LABEL: Record<Quarter, string> = {
  T0: 'T0 · Ene-Mar (base)',
  T1: 'T1 · Abr-Jun',
  T2: 'T2 · Jul-Sep',
  T3: 'T3 · Oct-Dic',
}

interface ProjectHonorarioFullYearModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proyecto: Proyecto | null
  onSaved?: () => void
}

export function ProjectHonorarioFullYearModal({
  open,
  onOpenChange,
  proyecto,
  onSaved,
}: ProjectHonorarioFullYearModalProps) {
  const [initial, setInitial] = useState<number[] | null>(null)
  const [values, setValues] = useState<number[]>(() => Array(12).fill(0))
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Inflation widget state
  const [inflationQuarter, setInflationQuarter] = useState<Exclude<Quarter, 'T0'>>('T1')
  const [inflationPercent, setInflationPercent] = useState('')

  // Reset + load whenever the dialog opens for a project.
  useEffect(() => {
    if (!open || !proyecto) return
    let cancelled = false
    setLoading(true)
    setInitial(null)
    setInflationPercent('')
    setInflationQuarter('T1')
    void (async () => {
      const rows = await getProjectHonorarioFullYear(proyecto.id)
      if (cancelled) return
      const arr = rows.map((r) => r.honorarios)
      setInitial(arr)
      setValues(arr.slice())
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, proyecto])

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

  const applyInflation = useCallback(() => {
    const pct = Number(inflationPercent)
    if (!Number.isFinite(pct)) return
    const factor = 1 + pct / 100
    setValues((prev) => {
      const next = prev.slice()
      for (let i = 0; i < 12; i++) {
        if (QUARTER_FOR_MONTH[i] === inflationQuarter) {
          next[i] = Math.max(0, prev[i] * factor)
        }
      }
      return next
    })
  }, [inflationPercent, inflationQuarter])

  const resetToInitial = useCallback(() => {
    if (initial) setValues(initial.slice())
  }, [initial])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!proyecto || !dirty || submitting) return
    setSubmitting(true)
    const result = await updateProjectHonorarioFullYear(
      proyecto.id,
      MONTHS.map((mes, i) => ({ mes, honorarios: values[i] }))
    )
    setSubmitting(false)
    if (result.success) {
      toast.success('Honorarios guardados')
      setInitial(values.slice())
      onSaved?.()
      onOpenChange(false)
    } else {
      toast.error('No se pudieron guardar los honorarios', {
        description: result.error,
      })
    }
  }

  const inflationPctValid =
    inflationPercent.length > 0 && Number.isFinite(Number(inflationPercent))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1">
          <DialogHeader>
            <DialogTitle>
              Honorarios mensuales · {proyecto?.nombre ?? 'Proyecto'} ·{' '}
              {CURRENT_YEAR}
            </DialogTitle>
            <DialogDescription>
              Editá el honorario de cada mes. Se guarda en{' '}
              <code className="text-2xs">horas_contratadas.honorarios_cotizador</code>.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto">
            {/* Inflation widget */}
            <div className="bg-base border border-border rounded-lg p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-secondary">
                <TrendingUp className="w-3 h-3" />
                Ajuste de inflación
              </div>
              <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                <Select
                  aria-label="Trimestre"
                  value={inflationQuarter}
                  onChange={(e) =>
                    setInflationQuarter(
                      e.target.value as Exclude<Quarter, 'T0'>
                    )
                  }
                >
                  <option value="T1">{QUARTER_LABEL.T1}</option>
                  <option value="T2">{QUARTER_LABEL.T2}</option>
                  <option value="T3">{QUARTER_LABEL.T3}</option>
                </Select>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="%"
                  value={inflationPercent}
                  onChange={(e) => setInflationPercent(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={applyInflation}
                  disabled={!inflationPctValid || loading}
                >
                  Aplicar
                </Button>
              </div>
              <div className="text-2xs text-tertiary">
                Multiplica los 3 meses del trimestre por (1 + %/100). Podés
                editar después manualmente.
              </div>
            </div>

            {/* Header row */}
            <div className="grid grid-cols-[100px_1fr_80px_60px] gap-3 px-2 pt-1">
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Mes
              </span>
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Honorario
              </span>
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary text-right">
                Δ vs prev
              </span>
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary text-right">
                Trim.
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
                        'grid grid-cols-[100px_1fr_80px_60px] gap-3 items-center px-2 py-1.5 border-b border-border last:border-0',
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
                      <span className="text-2xs text-tertiary text-right">
                        {QUARTER_FOR_MONTH[i]}
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
              disabled={!dirty || submitting || loading || !proyecto}
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
