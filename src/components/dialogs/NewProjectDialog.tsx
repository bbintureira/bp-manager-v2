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
import { createProyecto } from '@/lib/queries'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: 'activo', label: 'Activo' },
  { value: 'finalizado', label: 'Finalizado' },
]

export const TIPO_OPTIONS = [
  'Always On',
  'One Shot',
  'Producciones',
  'Upselling',
] as const

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when the project is created successfully. Use to refetch. */
  onCreated?: () => void
}

interface FormState {
  nombre: string
  tipo: string
  horas_requeridas: string
  fecha_inicio: string
  status: string
  /** Stored as raw strings so the inputs behave naturally (no leading-zero
   * weirdness, no fight with the number control). Parsed on save. */
  precios_por_mes: string[] // length 12
  fillAll: string // shortcut input — "apply this value to all 12 months"
}

const initial: FormState = {
  nombre: '',
  tipo: 'Always On',
  horas_requeridas: '160',
  fecha_inicio: '',
  status: 'activo',
  precios_por_mes: new Array(12).fill(''),
  fillAll: '',
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: NewProjectDialogProps) {
  const [form, setForm] = useState<FormState>(initial)
  const [submitting, setSubmitting] = useState(false)

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (open) setForm(initial)
  }, [open])

  const horasReqNum = Number(form.horas_requeridas)
  const preciosNum = useMemo(
    () =>
      form.precios_por_mes.map((s) => {
        const n = Number(s)
        return Number.isFinite(n) ? Math.max(0, n) : 0
      }),
    [form.precios_por_mes]
  )
  const totalAnio = preciosNum.reduce((s, x) => s + x, 0)
  const promedioMensual = totalAnio / 12
  const valorHoraPromedio =
    Number.isFinite(horasReqNum) && horasReqNum > 0
      ? promedioMensual / horasReqNum
      : null

  const valid =
    form.nombre.trim().length > 0 &&
    Number.isFinite(horasReqNum) &&
    horasReqNum > 0 &&
    form.status.length > 0 &&
    totalAnio > 0

  function setMonth(i: number, raw: string) {
    setForm((prev) => {
      const next = prev.precios_por_mes.slice()
      next[i] = raw
      return { ...prev, precios_por_mes: next }
    })
  }

  function applyFillAll() {
    const v = Number(form.fillAll)
    if (!Number.isFinite(v) || v < 0) return
    setForm((prev) => ({
      ...prev,
      precios_por_mes: new Array(12).fill(form.fillAll),
    }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    // Mirror the average into precio_mensual + honorarios_cotizador for
    // legacy compatibility; per-month variation lives in the seed array.
    const result = await createProyecto({
      nombre: form.nombre.trim(),
      tipo: form.tipo.trim() || null,
      honorarios_cotizador: promedioMensual,
      precio_mensual: promedioMensual,
      horas_requeridas_mensual: horasReqNum,
      fecha_inicio: form.fecha_inicio || null,
      status: form.status,
      honorarios_por_mes: preciosNum,
    })
    setSubmitting(false)
    if (result.success) {
      toast.success('Proyecto creado · 12 meses cargados con la grilla')
      onCreated?.()
      onOpenChange(false)
    } else {
      toast.error('No se pudo crear el proyecto', { description: result.error })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1">
          <DialogHeader>
            <DialogTitle>Nuevo proyecto</DialogTitle>
            <DialogDescription>
              Crear un proyecto nuevo en la cartera.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto">
            <Field id="np-nombre" label="Nombre" required>
              <Input
                id="np-nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Acme Corp · Q2"
                autoFocus
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="np-tipo" label="Tipo" required>
                <Select
                  id="np-tipo"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  {TIPO_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field id="np-status" label="Estado" required>
                <Select
                  id="np-status"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value })
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
              <Field
                id="np-horas-req"
                label="Horas requeridas / mes"
                required
                hint="Horas que el proyecto necesita por mes"
              >
                <Input
                  id="np-horas-req"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={form.horas_requeridas}
                  onChange={(e) =>
                    setForm({ ...form, horas_requeridas: e.target.value })
                  }
                  required
                />
              </Field>

              <Field id="np-fecha" label="Fecha de inicio">
                <Input
                  id="np-fecha"
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) =>
                    setForm({ ...form, fecha_inicio: e.target.value })
                  }
                />
              </Field>
            </div>

            {/* Section: precios por mes */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold tracking-snug text-primary">
                  Presupuesto mensual
                </h3>
                <span className="text-2xs text-tertiary">
                  Total año:{' '}
                  <span className="font-mono font-medium text-secondary">
                    ${totalAnio.toFixed(2)}
                  </span>
                  {valorHoraPromedio !== null && valorHoraPromedio > 0 && (
                    <>
                      {' · '}Valor/h prom.:{' '}
                      <span className="font-mono font-medium text-secondary">
                        ${valorHoraPromedio.toFixed(2)}
                      </span>
                    </>
                  )}
                </span>
              </div>

              {/* Apply-to-all shortcut */}
              <div className="bg-base border border-border rounded-md p-3 grid grid-cols-[1fr_auto] gap-2 items-center">
                <Field id="np-fill-all" label="Llenar todos los meses con">
                  <Input
                    id="np-fill-all"
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

              {/* 12-month grid */}
              <div className="grid grid-cols-[100px_1fr] gap-3 px-2 pt-1">
                <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                  Mes
                </span>
                <span className="text-2xs font-medium uppercase tracking-wider text-tertiary">
                  Honorario
                </span>
              </div>
              <div className="flex flex-col">
                {MONTHS.map((mes, i) => (
                  <div
                    key={mes}
                    className={cn(
                      'grid grid-cols-[100px_1fr] gap-3 items-center px-2 py-1.5 border-b border-border last:border-0'
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
                      placeholder="0,00"
                      value={form.precios_por_mes[i] ?? ''}
                      onChange={(e) => setMonth(i, e.target.value)}
                      onFocus={(e) => e.target.select()}
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
