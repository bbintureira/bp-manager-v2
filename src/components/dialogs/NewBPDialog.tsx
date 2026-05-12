import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { getMonthLabel } from '@/components/ui/month-picker'
import { createBrandPartner, type Grouper } from '@/lib/queries'
import { seniorityFromSueldo } from '@/lib/seniority'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const MES_OPTIONS = MONTHS.map((m) => ({ value: m, label: getMonthLabel(m) }))
const INGRESO_YEAR = 2026

interface NewBPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing groupers (canonical list from `groupers` table). */
  existingGroupers?: Grouper[]
  onCreated?: () => void
}

interface FormState {
  nombre: string
  /** FK to `groupers.id`. Empty string = "no grouper". */
  grouper_id: string
  capacidad_horas: string
  activo: 'activo' | 'inactivo'
  /** 1-12, defaults to January 2026. */
  mes_ingreso: number
  /** Strings so the inputs behave naturally; parsed on save. */
  sueldos_por_mes: string[] // length 12
  fillAll: string
}

const initial: FormState = {
  nombre: '',
  grouper_id: '',
  capacidad_horas: '160',
  activo: 'activo',
  mes_ingreso: 1,
  sueldos_por_mes: new Array(12).fill(''),
  fillAll: '',
}

export function NewBPDialog({
  open,
  onOpenChange,
  existingGroupers = [],
  onCreated,
}: NewBPDialogProps) {
  const [form, setForm] = useState<FormState>(initial)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setForm(initial)
  }, [open])

  const capNum = Number(form.capacidad_horas)
  const sueldosNum = useMemo(
    () =>
      form.sueldos_por_mes.map((s) => {
        const n = Number(s)
        return Number.isFinite(n) ? Math.max(0, n) : 0
      }),
    [form.sueldos_por_mes]
  )
  const totalAnio = sueldosNum.reduce((s, x) => s + x, 0)
  const monthsWithValue = sueldosNum.filter((v) => v > 0).length
  const promedioMensual =
    monthsWithValue === 0 ? 0 : totalAnio / monthsWithValue
  const costoHora =
    Number.isFinite(capNum) && capNum > 0 && promedioMensual > 0
      ? promedioMensual / capNum
      : null

  const valid = form.nombre.trim().length > 0
  const derivedSeniority = seniorityFromSueldo(promedioMensual)

  function setMonth(i: number, raw: string) {
    setForm((prev) => {
      const next = prev.sueldos_por_mes.slice()
      next[i] = raw
      return { ...prev, sueldos_por_mes: next }
    })
  }

  function applyFillAll() {
    const v = Number(form.fillAll)
    if (!Number.isFinite(v) || v < 0) return
    setForm((prev) => ({
      ...prev,
      sueldos_por_mes: new Array(12).fill(form.fillAll),
    }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    const result = await createBrandPartner({
      nombre: form.nombre.trim(),
      // Derived from sueldo (no manual input).
      seniority: derivedSeniority ?? null,
      grouper_id: form.grouper_id || null,
      // The scalar `sueldo_mensual` mirrors the average of months with a
      // non-zero value (so it represents the BP's typical paycheck, not
      // an annualized number diluted by zero months).
      sueldo_mensual: promedioMensual > 0 ? promedioMensual : null,
      capacidad_horas_mensual:
        Number.isFinite(capNum) && capNum > 0 ? capNum : null,
      activo: form.activo === 'activo',
      fecha_ingreso: `${INGRESO_YEAR}-${String(form.mes_ingreso).padStart(2, '0')}-01`,
      // Per-month grid → seeds `sueldos` rows, one per month.
      sueldos_por_mes: totalAnio > 0 ? sueldosNum : undefined,
    })
    setSubmitting(false)
    if (result.success) {
      toast.success(
        totalAnio > 0
          ? 'BP creado · 12 meses de sueldo cargados'
          : 'BP creado'
      )
      onCreated?.()
      onOpenChange(false)
    } else {
      toast.error('No se pudo crear el BP', { description: result.error })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1">
          <DialogHeader>
            <DialogTitle>Nuevo Brand Partner</DialogTitle>
            <DialogDescription>
              Agregar un BP a la plantilla.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto">
            <Field id="nb-nombre" label="Nombre" required>
              <Input
                id="nb-nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="María González"
                autoFocus
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                id="nb-seniority"
                label="Seniority"
                hint="Se calcula automáticamente desde el sueldo."
              >
                <div
                  id="nb-seniority"
                  className="h-10 px-3 rounded-md border border-border bg-base flex items-center text-sm"
                >
                  {derivedSeniority ?? (
                    <span className="text-tertiary">— (cargá el sueldo)</span>
                  )}
                </div>
              </Field>

              <Field id="nb-activo" label="Estado" required>
                <Select
                  id="nb-activo"
                  value={form.activo}
                  onChange={(e) =>
                    setForm({
                      ...form,
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
              id="nb-grouper"
              label="Grouper"
              hint='Elegí uno de la lista. Para crear uno nuevo usá el botón "Groupers" en la página de BPs.'
            >
              <Select
                id="nb-grouper"
                value={form.grouper_id}
                onChange={(e) =>
                  setForm({ ...form, grouper_id: e.target.value })
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
              <Field
                id="nb-capacidad"
                label="Capacidad horas / mes"
                hint="Default: 160"
              >
                <Input
                  id="nb-capacidad"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={form.capacidad_horas}
                  onChange={(e) =>
                    setForm({ ...form, capacidad_horas: e.target.value })
                  }
                />
              </Field>

              <Field
                id="nb-mes-ingreso"
                label={`Mes de ingreso ${INGRESO_YEAR}`}
                hint="Los cálculos anuales arrancan desde este mes."
              >
                <Select
                  id="nb-mes-ingreso"
                  value={String(form.mes_ingreso)}
                  onChange={(e) =>
                    setForm({ ...form, mes_ingreso: Number(e.target.value) })
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

            {/* Section: sueldos por mes */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold tracking-snug text-primary">
                  Sueldo mensual
                </h3>
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

              {/* Apply-to-all shortcut */}
              <div className="bg-base border border-border rounded-md p-3 grid grid-cols-[1fr_auto] gap-2 items-center">
                <Field id="nb-fill-all" label="Llenar todos los meses con">
                  <Input
                    id="nb-fill-all"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={form.fillAll}
                    onChange={(e) =>
                      setForm({ ...form, fillAll: e.target.value })
                    }
                    placeholder="0,00"
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={applyFillAll}
                  disabled={
                    form.fillAll.length === 0 ||
                    !Number.isFinite(Number(form.fillAll))
                  }
                >
                  Aplicar
                </Button>
              </div>

              <div className="grid grid-cols-[100px_1fr] gap-3 px-2 pt-1">
                <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                  Mes
                </span>
                <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                  Sueldo
                </span>
              </div>
              <div className="flex flex-col">
                {MONTHS.map((mes, i) => (
                  <div
                    key={mes}
                    className="grid grid-cols-[100px_1fr] gap-3 items-center px-2 py-1.5 border-b border-border last:border-0"
                  >
                    <span className="text-sm font-medium">
                      {getMonthLabel(mes)}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={form.sueldos_por_mes[i] ?? ''}
                      onChange={(e) => setMonth(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
