import { useEffect, useState, type FormEvent } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  createAsignacion,
  type BrandPartner,
  type Proyecto,
} from '@/lib/queries'
import { displaySeniority } from '@/lib/seniority'
import { getMonthLabel } from '@/components/ui/month-picker'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

interface NewAsignacionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proyectos: Proyecto[]
  brandPartners: BrandPartner[]
  /** Pre-fills the month dropdown. Defaults to current month. */
  defaultMes?: number
  onCreated?: () => void
}

function makeInitial(defaultMes: number) {
  return {
    proyecto_id: '',
    bp_id: '',
    mes: String(defaultMes),
    horas: '',
    applyToAll: true,
  }
}

export function NewAsignacionDialog({
  open,
  onOpenChange,
  proyectos,
  brandPartners,
  defaultMes = new Date().getMonth() + 1,
  onCreated,
}: NewAsignacionDialogProps) {
  const [form, setForm] = useState(() => makeInitial(defaultMes))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setForm(makeInitial(defaultMes))
  }, [open, defaultMes])

  const horasNum = Number(form.horas)
  const mesNum = Number(form.mes)
  const valid =
    form.proyecto_id !== '' &&
    form.bp_id !== '' &&
    (form.applyToAll ||
      (Number.isFinite(mesNum) && mesNum >= 1 && mesNum <= 12)) &&
    Number.isFinite(horasNum) &&
    horasNum > 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    const result = await createAsignacion({
      proyecto_id: form.proyecto_id,
      bp_id: form.bp_id,
      mes: form.applyToAll ? 1 : mesNum, // ignored by helper when applyToAll
      horas: horasNum,
      applyToAllMonths: form.applyToAll,
    })
    setSubmitting(false)
    if (result.success) {
      toast.success(
        form.applyToAll
          ? 'Asignaciones creadas para los 12 meses'
          : 'Asignación creada'
      )
      onCreated?.()
      onOpenChange(false)
    } else {
      toast.error('No se pudo crear la asignación', {
        description: result.error,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Nueva asignación</DialogTitle>
            <DialogDescription>
              Asignar horas de un BP a un proyecto durante un mes.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Field id="na-proyecto" label="Proyecto" required>
              <Select
                id="na-proyecto"
                value={form.proyecto_id}
                onChange={(e) =>
                  setForm({ ...form, proyecto_id: e.target.value })
                }
                required
              >
                <option value="" disabled>
                  Elegí un proyecto…
                </option>
                {proyectos.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="na-bp" label="Brand Partner" required>
              <Select
                id="na-bp"
                value={form.bp_id}
                onChange={(e) => setForm({ ...form, bp_id: e.target.value })}
                required
              >
                <option value="" disabled>
                  Elegí un BP…
                </option>
                {brandPartners.map((bp) => {
                  const sen = displaySeniority(bp)
                  return (
                    <option key={String(bp.id)} value={String(bp.id)}>
                      {bp.nombre}
                      {sen ? ` · ${sen}` : ''}
                    </option>
                  )
                })}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="na-mes" label="Mes" required>
                <Select
                  id="na-mes"
                  value={form.mes}
                  onChange={(e) => setForm({ ...form, mes: e.target.value })}
                  required
                  disabled={form.applyToAll}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {getMonthLabel(m)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field id="na-horas" label="Horas" required hint="0–160 típico">
                <Input
                  id="na-horas"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={form.horas}
                  onChange={(e) => setForm({ ...form, horas: e.target.value })}
                  required
                />
              </Field>
            </div>

            <Checkbox
              checked={form.applyToAll}
              onChange={(e) =>
                setForm({ ...form, applyToAll: e.target.checked })
              }
              label="Aplicar a todos los meses del año"
              hint="Genera 12 filas (una por mes) en vez de una sola."
              inline
            />
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
