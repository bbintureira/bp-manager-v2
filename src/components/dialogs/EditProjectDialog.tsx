import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/loading-states'
import { getMonthLabel } from '@/components/ui/month-picker'
import { TIPO_OPTIONS } from '@/components/dialogs/NewProjectDialog'
import {
  getProjectHonorarioFullYear,
  updateProjectHonorarioFullYear,
  updateProyecto,
  type Proyecto,
} from '@/lib/queries'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: 'activo', label: 'Activo' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'finalizado', label: 'Finalizado' },
]

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

type Quarter = 'T0' | 'T1' | 'T2' | 'T3'

const QUARTER_FOR_MONTH: Quarter[] = [
  'T0', 'T0', 'T0',
  'T1', 'T1', 'T1',
  'T2', 'T2', 'T2',
  'T3', 'T3', 'T3',
]

const QUARTER_LABEL: Record<Quarter, string> = {
  T0: 'T0 · Ene-Mar (base)',
  T1: 'T1 · Abr-Jun',
  T2: 'T2 · Jul-Sep',
  T3: 'T3 · Oct-Dic',
}

interface EditProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Project being edited. Form is prefilled from this row. */
  proyecto: Proyecto | null
  onSaved?: () => void
}

interface BasicFormState {
  nombre: string
  tipo: string
  precio_mensual: string
  horas_requeridas: string
  fecha_inicio: string
  status: string
}

function basicFromProyecto(p: Proyecto | null): BasicFormState {
  return {
    nombre: p?.nombre ?? '',
    tipo: p?.tipo ?? 'Always On',
    precio_mensual:
      p?.precio_mensual != null
        ? String(p.precio_mensual)
        : p?.honorarios_cotizador != null
          ? String(p.honorarios_cotizador)
          : '',
    horas_requeridas:
      p?.horas_requeridas_mensual != null
        ? String(p.horas_requeridas_mensual)
        : '160',
    fecha_inicio: p?.fecha_inicio ?? '',
    status: p?.status ?? 'activo',
  }
}

export function EditProjectDialog({
  open,
  onOpenChange,
  proyecto,
  onSaved,
}: EditProjectDialogProps) {
  // ----- Section 1: basic fields
  const [basic, setBasic] = useState<BasicFormState>(() =>
    basicFromProyecto(proyecto)
  )
  const [initialBasic, setInitialBasic] = useState<BasicFormState>(() =>
    basicFromProyecto(proyecto)
  )

  // ----- Section 2: monthly honorarios
  const [honorarios, setHonorarios] = useState<number[]>(() =>
    new Array(12).fill(0)
  )
  const [initialHonorarios, setInitialHonorarios] = useState<number[] | null>(
    null
  )
  const [loadingHonorarios, setLoadingHonorarios] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  // Inflation widget
  const [inflationQuarter, setInflationQuarter] =
    useState<Exclude<Quarter, 'T0'>>('T1')
  const [inflationPercent, setInflationPercent] = useState('')

  // ----- Re-prime when the dialog opens for a project
  useEffect(() => {
    if (!open || !proyecto) return
    const fresh = basicFromProyecto(proyecto)
    setBasic(fresh)
    setInitialBasic(fresh)
    setInflationPercent('')
    setInflationQuarter('T1')
    setLoadingHonorarios(true)
    setInitialHonorarios(null)
    let cancelled = false
    void (async () => {
      const rows = await getProjectHonorarioFullYear(proyecto.id)
      if (cancelled) return
      const arr = rows.map((r) => r.honorarios)
      setHonorarios(arr)
      setInitialHonorarios(arr.slice())
      setLoadingHonorarios(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, proyecto])

  // ----- dirty / validation
  const basicDirty = useMemo(
    () =>
      basic.nombre !== initialBasic.nombre ||
      basic.tipo !== initialBasic.tipo ||
      basic.precio_mensual !== initialBasic.precio_mensual ||
      basic.horas_requeridas !== initialBasic.horas_requeridas ||
      basic.fecha_inicio !== initialBasic.fecha_inicio ||
      basic.status !== initialBasic.status,
    [basic, initialBasic]
  )

  const precioNum = Number(basic.precio_mensual)
  const horasReqNum = Number(basic.horas_requeridas)
  const valorHora =
    Number.isFinite(precioNum) && Number.isFinite(horasReqNum) && horasReqNum > 0
      ? precioNum / horasReqNum
      : null

  const honorariosDirty = useMemo(() => {
    if (!initialHonorarios) return false
    return honorarios.some((v, i) => v !== initialHonorarios[i])
  }, [honorarios, initialHonorarios])

  const dirty = basicDirty || honorariosDirty

  const valid =
    basic.nombre.trim().length > 0 && basic.status.length > 0

  // ----- handlers
  function setMonthValue(i: number, raw: string) {
    setHonorarios((prev) => {
      const next = prev.slice()
      const parsed = Number(raw)
      next[i] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      return next
    })
  }

  function applyInflation() {
    const pct = Number(inflationPercent)
    if (!Number.isFinite(pct)) return
    const factor = 1 + pct / 100
    setHonorarios((prev) => {
      const next = prev.slice()
      for (let i = 0; i < 12; i++) {
        if (QUARTER_FOR_MONTH[i] === inflationQuarter) {
          next[i] = Math.max(0, prev[i] * factor)
        }
      }
      return next
    })
  }

  function resetChanges() {
    setBasic(initialBasic)
    if (initialHonorarios) setHonorarios(initialHonorarios.slice())
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!proyecto || !valid || !dirty || submitting) return
    setSubmitting(true)

    // Run both updates in parallel; collect partial failures.
    const tasks: Promise<{ kind: string; ok: boolean; error?: string }>[] = []
    if (basicDirty) {
      const precio = Number.isFinite(precioNum) ? precioNum : null
      tasks.push(
        updateProyecto(proyecto.id, {
          nombre: basic.nombre.trim(),
          tipo: basic.tipo.trim() || null,
          // Mirror precio into legacy honorarios_cotizador only when the
          // user actually entered a number — otherwise leave the legacy
          // value untouched.
          ...(precio !== null && precio > 0
            ? { honorarios_cotizador: precio, precio_mensual: precio }
            : {}),
          horas_requeridas_mensual: Number.isFinite(horasReqNum) && horasReqNum > 0
            ? horasReqNum
            : null,
          fecha_inicio: basic.fecha_inicio || null,
          status: basic.status,
        }).then((r) => ({
          kind: 'datos básicos',
          ok: r.success,
          error: r.success ? undefined : r.error,
        }))
      )
    }
    if (honorariosDirty) {
      tasks.push(
        updateProjectHonorarioFullYear(
          proyecto.id,
          MONTHS.map((mes, i) => ({ mes, honorarios: honorarios[i] }))
        ).then((r) => ({
          kind: 'honorarios mensuales',
          ok: r.success,
          error: r.success ? undefined : r.error,
        }))
      )
    }
    const results = await Promise.all(tasks)
    setSubmitting(false)
    const failed = results.filter((r) => !r.ok)
    if (failed.length === 0) {
      toast.success('Cambios guardados')
      onSaved?.()
      onOpenChange(false)
    } else if (failed.length < results.length) {
      toast.error(`Falló: ${failed.map((f) => f.kind).join(', ')}`, {
        description: failed[0]?.error,
      })
    } else {
      toast.error('No se pudo guardar', { description: failed[0]?.error })
    }
  }

  const inflationPctValid =
    inflationPercent.length > 0 && Number.isFinite(Number(inflationPercent))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px] max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1">
          <DialogHeader>
            <DialogTitle>Editar proyecto</DialogTitle>
            <DialogDescription>
              {proyecto?.nombre ?? 'Proyecto'} — actualizar datos básicos y
              honorarios mensuales.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto">
            {/* Section 1: basic fields */}
            <SectionTitle>Datos básicos</SectionTitle>

            <Field id="ep-nombre" label="Nombre" required>
              <Input
                id="ep-nombre"
                value={basic.nombre}
                onChange={(e) =>
                  setBasic({ ...basic, nombre: e.target.value })
                }
                autoFocus
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="ep-tipo" label="Tipo" required>
                <Select
                  id="ep-tipo"
                  value={basic.tipo}
                  onChange={(e) =>
                    setBasic({ ...basic, tipo: e.target.value })
                  }
                >
                  {TIPO_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {basic.tipo &&
                    !(TIPO_OPTIONS as readonly string[]).includes(
                      basic.tipo
                    ) && (
                      <option key={basic.tipo} value={basic.tipo}>
                        {basic.tipo} (actual)
                      </option>
                    )}
                </Select>
              </Field>

              <Field id="ep-status" label="Estado" required>
                <Select
                  id="ep-status"
                  value={basic.status}
                  onChange={(e) =>
                    setBasic({ ...basic, status: e.target.value })
                  }
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field id="ep-precio" label="Precio mensual" required>
                <Input
                  id="ep-precio"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={basic.precio_mensual}
                  onChange={(e) =>
                    setBasic({ ...basic, precio_mensual: e.target.value })
                  }
                  required
                />
              </Field>

              <Field
                id="ep-horas-req"
                label="Horas requeridas / mes"
                required
              >
                <Input
                  id="ep-horas-req"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={basic.horas_requeridas}
                  onChange={(e) =>
                    setBasic({ ...basic, horas_requeridas: e.target.value })
                  }
                  required
                />
              </Field>
            </div>

            {valorHora !== null && valorHora > 0 && (
              <div className="text-2xs text-tertiary -mt-2">
                Valor / h proyecto:{' '}
                <span className="font-mono font-medium text-secondary">
                  ${valorHora.toFixed(2)}
                </span>
              </div>
            )}

            <Field id="ep-fecha" label="Fecha de inicio">
              <Input
                id="ep-fecha"
                type="date"
                value={basic.fecha_inicio}
                onChange={(e) =>
                  setBasic({ ...basic, fecha_inicio: e.target.value })
                }
              />
            </Field>

            {/* Section 2: monthly honorarios */}
            <SectionTitle className="mt-2">Honorarios mensuales</SectionTitle>

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
                  disabled={!inflationPctValid || loadingHonorarios}
                >
                  Aplicar
                </Button>
              </div>
              <div className="text-2xs text-tertiary">
                Multiplica los 3 meses del trimestre por (1 + %/100).
              </div>
            </div>

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

            {loadingHonorarios || !initialHonorarios ? (
              <TableSkeleton rows={6} />
            ) : (
              <div className="flex flex-col">
                {MONTHS.map((mes, i) => {
                  const v = honorarios[i]
                  const prev = i > 0 ? honorarios[i - 1] : null
                  const pct =
                    prev !== null && prev > 0 ? ((v - prev) / prev) * 100 : null
                  const changed =
                    initialHonorarios && v !== initialHonorarios[i]
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
              onClick={resetChanges}
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
              disabled={!valid || !dirty || submitting || !proyecto}
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

function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h3
      className={cn(
        'text-sm font-semibold tracking-snug text-primary',
        className
      )}
    >
      {children}
    </h3>
  )
}
