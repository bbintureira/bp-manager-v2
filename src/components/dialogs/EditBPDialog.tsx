import {
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
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/loading-states'
import { getMonthLabel } from '@/components/ui/month-picker'
import {
  getBPCapacidadFullYear,
  getBPSueldosFullYear,
  updateBPCapacidadFullYear,
  updateBPSueldosFullYear,
  updateBrandPartner,
  type BrandPartner,
} from '@/lib/queries'
import { cn } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const MES_OPTIONS = MONTHS.map((m) => ({ value: m, label: getMonthLabel(m) }))

interface EditBPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bp: BrandPartner | null
  onSaved?: () => void
}

interface BasicFormState {
  nombre: string
  capacidad_horas: string
  activo: 'activo' | 'inactivo'
  /** 1-12, defaults to January. Persists as `2026-MM-01`. */
  mes_ingreso: number
}

const INGRESO_YEAR = 2026

function parseMesIngreso(fecha: string | null | undefined): number {
  if (!fecha) return 1
  const m = Number(fecha.slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1
}

function basicFromBP(bp: BrandPartner | null): BasicFormState {
  return {
    nombre: bp?.nombre ?? '',
    capacidad_horas:
      bp?.capacidad_horas_mensual != null
        ? String(bp.capacidad_horas_mensual)
        : '160',
    activo: bp?.activo === false ? 'inactivo' : 'activo',
    mes_ingreso: parseMesIngreso(bp?.fecha_ingreso),
  }
}

export function EditBPDialog({
  open,
  onOpenChange,
  bp,
  onSaved,
}: EditBPDialogProps) {
  // ----- Section 1: basic
  const [basic, setBasic] = useState<BasicFormState>(() => basicFromBP(bp))
  const [initialBasic, setInitialBasic] = useState<BasicFormState>(() =>
    basicFromBP(bp)
  )

  // ----- Section 2: monthly sueldos + monthly contracted capacity
  const [sueldos, setSueldos] = useState<number[]>(() => new Array(12).fill(0))
  const [initialSueldos, setInitialSueldos] = useState<number[] | null>(null)
  const [capacidades, setCapacidades] = useState<number[]>(() =>
    new Array(12).fill(0)
  )
  const [initialCapacidades, setInitialCapacidades] = useState<
    number[] | null
  >(null)
  const [loadingSueldos, setLoadingSueldos] = useState(false)

  const [fillAll, setFillAll] = useState('')
  const [fillAllCap, setFillAllCap] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ----- Re-prime when the dialog opens for a (possibly different) BP.
  useEffect(() => {
    if (!open || !bp) return
    const fresh = basicFromBP(bp)
    setBasic(fresh)
    setInitialBasic(fresh)
    setFillAll('')
    setFillAllCap('')
    setLoadingSueldos(true)
    setInitialSueldos(null)
    setInitialCapacidades(null)
    let cancelled = false
    void (async () => {
      // Capacity months with no row come back prefilled with the BP's
      // current scalar, so opening the grid shows today's value in all 12
      // and you only touch the months that actually change.
      const [sueldoRows, capRows] = await Promise.all([
        getBPSueldosFullYear(bp.id),
        getBPCapacidadFullYear(bp.id, bp.capacidad_horas_mensual),
      ])
      if (cancelled) return
      const arr = sueldoRows.map((r) => r.sueldo)
      setSueldos(arr)
      setInitialSueldos(arr.slice())
      const caps = capRows.map((r) => r.horas)
      setCapacidades(caps)
      setInitialCapacidades(caps.slice())
      setLoadingSueldos(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, bp])

  // ----- dirty / validation
  const basicDirty = useMemo(
    () =>
      basic.nombre !== initialBasic.nombre ||
      basic.capacidad_horas !== initialBasic.capacidad_horas ||
      basic.activo !== initialBasic.activo ||
      basic.mes_ingreso !== initialBasic.mes_ingreso,
    [basic, initialBasic]
  )

  const sueldosDirty = useMemo(() => {
    if (!initialSueldos) return false
    return sueldos.some((v, i) => v !== initialSueldos[i])
  }, [sueldos, initialSueldos])

  const capacidadesDirty = useMemo(() => {
    if (!initialCapacidades) return false
    return capacidades.some((v, i) => v !== initialCapacidades[i])
  }, [capacidades, initialCapacidades])

  const dirty = basicDirty || sueldosDirty || capacidadesDirty

  const valid = basic.nombre.trim().length > 0

  const capNum = Number(basic.capacidad_horas)
  const totalAnio = sueldos.reduce((s, x) => s + x, 0)
  const monthsWithValue = sueldos.filter((v) => v > 0).length
  const promedioMensual =
    monthsWithValue === 0 ? 0 : totalAnio / monthsWithValue
  // Reference costo/h uses the average capacity over the months that
  // actually have a sueldo — with per-month capacity a single scalar would
  // misprice a BP whose dedication changes mid-year.
  const capPromedio = useMemo(() => {
    const activos = capacidades.filter((_, i) => sueldos[i] > 0)
    const base = activos.length > 0 ? activos : capacidades
    const withValue = base.filter((v) => v > 0)
    if (withValue.length > 0) {
      return withValue.reduce((s, x) => s + x, 0) / withValue.length
    }
    return Number.isFinite(capNum) && capNum > 0 ? capNum : 0
  }, [capacidades, sueldos, capNum])
  const costoHora =
    capPromedio > 0 && promedioMensual > 0 ? promedioMensual / capPromedio : null

  // ----- handlers
  function setMonth(i: number, raw: string) {
    setSueldos((prev) => {
      const next = prev.slice()
      const parsed = Number(raw)
      next[i] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      return next
    })
  }

  function setMonthCapacidad(i: number, raw: string) {
    setCapacidades((prev) => {
      const next = prev.slice()
      const parsed = Number(raw)
      next[i] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      return next
    })
  }

  function applyFillAll() {
    const v = Number(fillAll)
    if (!Number.isFinite(v) || v < 0) return
    setSueldos(new Array(12).fill(v))
  }

  function applyFillAllCap() {
    const v = Number(fillAllCap)
    if (!Number.isFinite(v) || v < 0) return
    setCapacidades(new Array(12).fill(v))
  }

  function resetChanges() {
    setBasic(initialBasic)
    if (initialSueldos) setSueldos(initialSueldos.slice())
    if (initialCapacidades) setCapacidades(initialCapacidades.slice())
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!bp || !valid || !dirty || submitting) return
    setSubmitting(true)

    const tasks: Promise<{ kind: string; ok: boolean; error?: string }>[] = []
    if (basicDirty) {
      tasks.push(
        updateBrandPartner(bp.id, {
          nombre: basic.nombre.trim(),
          capacidad_horas_mensual:
            Number.isFinite(capNum) && capNum > 0 ? capNum : null,
          activo: basic.activo === 'activo',
          fecha_ingreso: `${INGRESO_YEAR}-${String(basic.mes_ingreso).padStart(2, '0')}-01`,
          // Mirror the avg into the scalar sueldo_mensual.
          ...(promedioMensual > 0
            ? { sueldo_mensual: promedioMensual }
            : {}),
        }).then((r) => ({
          kind: 'datos básicos',
          ok: r.success,
          error: r.success ? undefined : r.error,
        }))
      )
    }
    if (capacidadesDirty) {
      tasks.push(
        updateBPCapacidadFullYear(
          bp.id,
          MONTHS.map((mes, i) => ({ mes, horas: capacidades[i] }))
        ).then((r) => ({
          kind: 'horas contratadas mensuales',
          ok: r.success,
          error: r.success ? undefined : r.error,
        }))
      )
    }
    if (sueldosDirty) {
      tasks.push(
        updateBPSueldosFullYear(
          bp.id,
          MONTHS.map((mes, i) => ({ mes, sueldo: sueldos[i] }))
        ).then((r) => ({
          kind: 'sueldos mensuales',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1">
          <DialogHeader>
            <DialogTitle>Editar Brand Partner</DialogTitle>
            <DialogDescription>
              {bp?.nombre ?? 'BP'} — actualizar datos básicos y sueldos
              mensuales.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto">
            {/* Section 1 */}
            <SectionTitle>Datos básicos</SectionTitle>

            <Field id="eb-nombre" label="Nombre" required>
              <Input
                id="eb-nombre"
                value={basic.nombre}
                onChange={(e) => setBasic({ ...basic, nombre: e.target.value })}
                autoFocus
                required
              />
            </Field>

            <Field id="eb-activo" label="Estado" required>
              <Select
                id="eb-activo"
                value={basic.activo}
                onChange={(e) =>
                  setBasic({
                    ...basic,
                    activo: e.target.value as 'activo' | 'inactivo',
                  })
                }
              >
                <option value="activo">Activo</option>
                <option value="inactivo">No activo</option>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="eb-capacidad" label="Capacidad horas / mes">
                <Input
                  id="eb-capacidad"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={basic.capacidad_horas}
                  onChange={(e) =>
                    setBasic({ ...basic, capacidad_horas: e.target.value })
                  }
                />
              </Field>

              <Field
                id="eb-mes-ingreso"
                label={`Mes de ingreso ${INGRESO_YEAR}`}
                hint="Los cálculos anuales arrancan desde este mes."
              >
                <Select
                  id="eb-mes-ingreso"
                  value={String(basic.mes_ingreso)}
                  onChange={(e) =>
                    setBasic({
                      ...basic,
                      mes_ingreso: Number(e.target.value),
                    })
                  }
                >
                  {MES_OPTIONS.map((o) => (
                    <option key={o.value} value={String(o.value)}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Section 2 */}
            <SectionTitle className="mt-2">
              Horas contratadas y sueldos por mes
            </SectionTitle>
            <p className="text-2xs text-tertiary -mt-1">
              La capacidad de cada mes se carga por separado: arranca con el
              valor actual del BP y sólo tocás los meses que cambian. El campo
              «Capacidad horas / mes» de arriba queda como valor por defecto
              para los meses sin fila propia.
            </p>

            <div className="flex items-center justify-end gap-2">
              <span className="text-2xs text-tertiary">
                Total año:{' '}
                <span className="font-mono font-medium text-secondary">
                  ${totalAnio.toFixed(2)}
                </span>
                {costoHora !== null && (
                  <>
                    {' · '}Costo/h:{' '}
                    <span className="font-mono font-medium text-secondary">
                      ${costoHora.toFixed(2)}
                    </span>
                  </>
                )}
              </span>
            </div>

            {/* Fill-all shortcuts */}
            <div className="bg-base border border-border rounded-md p-3 grid grid-cols-[1fr_auto] gap-2 items-center">
              <Field id="eb-fill-all-cap" label="Llenar todas las horas con">
                <Input
                  id="eb-fill-all-cap"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={fillAllCap}
                  onChange={(e) => setFillAllCap(e.target.value)}
                  placeholder="160"
                  disabled={loadingSueldos}
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={applyFillAllCap}
                disabled={
                  loadingSueldos ||
                  fillAllCap.length === 0 ||
                  !Number.isFinite(Number(fillAllCap))
                }
              >
                Aplicar
              </Button>
              <Field id="eb-fill-all" label="Llenar todos los sueldos con">
                <Input
                  id="eb-fill-all"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={fillAll}
                  onChange={(e) => setFillAll(e.target.value)}
                  placeholder="0,00"
                  disabled={loadingSueldos}
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={applyFillAll}
                disabled={
                  loadingSueldos ||
                  fillAll.length === 0 ||
                  !Number.isFinite(Number(fillAll))
                }
              >
                Aplicar
              </Button>
            </div>

            {/* Header row */}
            <div className="grid grid-cols-[100px_110px_1fr] gap-3 px-2 pt-1">
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Mes
              </span>
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Horas contr.
              </span>
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Sueldo
              </span>
            </div>

            {loadingSueldos || !initialSueldos || !initialCapacidades ? (
              <TableSkeleton rows={6} />
            ) : (
              <div className="flex flex-col">
                {MONTHS.map((mes, i) => {
                  const v = sueldos[i]
                  const c = capacidades[i]
                  const initVal = initialSueldos?.[i]
                  const initCap = initialCapacidades?.[i]
                  const changed =
                    (initVal !== undefined && initVal !== v) ||
                    (initCap !== undefined && initCap !== c)
                  return (
                    <div
                      key={mes}
                      className={cn(
                        'grid grid-cols-[100px_110px_1fr] gap-3 items-center px-2 py-1.5 border-b border-border last:border-0',
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
                        step="1"
                        aria-label={`Horas contratadas ${getMonthLabel(mes)}`}
                        value={Number.isFinite(c) ? c : 0}
                        onChange={(e) => setMonthCapacidad(i, e.target.value)}
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        aria-label={`Sueldo ${getMonthLabel(mes)}`}
                        value={Number.isFinite(v) ? v : 0}
                        onChange={(e) => setMonth(i, e.target.value)}
                      />
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
              disabled={!valid || !dirty || submitting || !bp}
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
