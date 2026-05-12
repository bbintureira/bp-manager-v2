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
  getBPSueldosFullYear,
  updateBPSueldosFullYear,
  updateBrandPartner,
  type BrandPartner,
  type Grouper,
} from '@/lib/queries'
import { seniorityFromSueldo } from '@/lib/seniority'
import { cn } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const MES_OPTIONS = MONTHS.map((m) => ({ value: m, label: getMonthLabel(m) }))

interface EditBPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bp: BrandPartner | null
  /** Existing groupers (canonical list from `groupers` table). */
  existingGroupers?: Grouper[]
  onSaved?: () => void
}

interface BasicFormState {
  nombre: string
  /** FK to groupers.id. Empty string = "no grouper". */
  grouper_id: string
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
    grouper_id: bp?.grouper_id ?? '',
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
  existingGroupers = [],
  onSaved,
}: EditBPDialogProps) {
  // ----- Section 1: basic
  const [basic, setBasic] = useState<BasicFormState>(() => basicFromBP(bp))
  const [initialBasic, setInitialBasic] = useState<BasicFormState>(() =>
    basicFromBP(bp)
  )

  // ----- Section 2: monthly sueldos
  const [sueldos, setSueldos] = useState<number[]>(() => new Array(12).fill(0))
  const [initialSueldos, setInitialSueldos] = useState<number[] | null>(null)
  const [loadingSueldos, setLoadingSueldos] = useState(false)

  const [fillAll, setFillAll] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ----- Re-prime when the dialog opens for a (possibly different) BP.
  useEffect(() => {
    if (!open || !bp) return
    const fresh = basicFromBP(bp)
    setBasic(fresh)
    setInitialBasic(fresh)
    setFillAll('')
    setLoadingSueldos(true)
    setInitialSueldos(null)
    let cancelled = false
    void (async () => {
      const rows = await getBPSueldosFullYear(bp.id)
      if (cancelled) return
      const arr = rows.map((r) => r.sueldo)
      setSueldos(arr)
      setInitialSueldos(arr.slice())
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
      basic.grouper_id !== initialBasic.grouper_id ||
      basic.capacidad_horas !== initialBasic.capacidad_horas ||
      basic.activo !== initialBasic.activo ||
      basic.mes_ingreso !== initialBasic.mes_ingreso,
    [basic, initialBasic]
  )

  const sueldosDirty = useMemo(() => {
    if (!initialSueldos) return false
    return sueldos.some((v, i) => v !== initialSueldos[i])
  }, [sueldos, initialSueldos])

  const dirty = basicDirty || sueldosDirty

  const valid = basic.nombre.trim().length > 0

  const capNum = Number(basic.capacidad_horas)
  const totalAnio = sueldos.reduce((s, x) => s + x, 0)
  const monthsWithValue = sueldos.filter((v) => v > 0).length
  const promedioMensual =
    monthsWithValue === 0 ? 0 : totalAnio / monthsWithValue
  const costoHora =
    Number.isFinite(capNum) && capNum > 0 && promedioMensual > 0
      ? promedioMensual / capNum
      : null
  const derivedSeniority = seniorityFromSueldo(promedioMensual)

  // ----- handlers
  function setMonth(i: number, raw: string) {
    setSueldos((prev) => {
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

  function resetChanges() {
    setBasic(initialBasic)
    if (initialSueldos) setSueldos(initialSueldos.slice())
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
          // Seniority is derived from sueldo. Persist it so legacy reads
          // that haven't been migrated still see a consistent value.
          seniority: derivedSeniority ?? null,
          grouper_id: basic.grouper_id || null,
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

            <div className="grid grid-cols-2 gap-3">
              <Field
                id="eb-seniority"
                label="Seniority"
                hint="Se calcula automáticamente desde el sueldo promedio."
              >
                <div
                  id="eb-seniority"
                  className="h-10 px-3 rounded-md border border-border bg-base flex items-center text-sm"
                >
                  {derivedSeniority ?? (
                    <span className="text-tertiary">— (cargá el sueldo)</span>
                  )}
                </div>
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
            </div>

            <Field
              id="eb-grouper"
              label="Grouper"
              hint='Elegí uno de la lista. Para crear uno nuevo usá el botón "Groupers" en la página de BPs.'
            >
              <Select
                id="eb-grouper"
                value={basic.grouper_id}
                onChange={(e) =>
                  setBasic({ ...basic, grouper_id: e.target.value })
                }
              >
                <option value="">Sin grouper</option>
                {existingGroupers.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
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
            <SectionTitle className="mt-2">Sueldos mensuales</SectionTitle>

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

            {/* Fill-all shortcut */}
            <div className="bg-base border border-border rounded-md p-3 grid grid-cols-[1fr_auto] gap-2 items-center">
              <Field id="eb-fill-all" label="Llenar todos los meses con">
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
            <div className="grid grid-cols-[100px_1fr] gap-3 px-2 pt-1">
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Mes
              </span>
              <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                Sueldo
              </span>
            </div>

            {loadingSueldos || !initialSueldos ? (
              <TableSkeleton rows={6} />
            ) : (
              <div className="flex flex-col">
                {MONTHS.map((mes, i) => {
                  const v = sueldos[i]
                  const initVal = initialSueldos?.[i]
                  const changed = initVal !== undefined && initVal !== v
                  return (
                    <div
                      key={mes}
                      className={cn(
                        'grid grid-cols-[100px_1fr] gap-3 items-center px-2 py-1.5 border-b border-border last:border-0',
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
