import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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
import { KpiCard } from '@/components/ui/kpi-card'
import {
  EmptyState,
  KpiSkeletonGrid,
  TableSkeleton,
} from '@/components/ui/loading-states'
import { chartTooltipStyle } from '@/components/ui/chart-card'
import { getMonthLabel } from '@/components/ui/month-picker'
import {
  formatCurrency,
  formatHours,
  formatPercent,
} from '@/lib/format'
import { getAnnualSnapshot, type BrandPartner } from '@/lib/queries'
import {
  bpHorasMonthRow,
  bpHorasYear,
  bpRentabilidadMonthRow,
  bpRentabilidadYear,
  type BPHorasYearRow,
  type BPRentabilidadYearRow,
} from '@/lib/calculations'
import { displaySeniority } from '@/lib/seniority'
import { cn } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

type TabKey = 'horas' | 'rentabilidad'
type DetailMode = 'mensual' | 'anual'

interface BPDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bp: BrandPartner | null
  /** Which page tab opened the modal — controls the body content. */
  activeTab: TabKey
  /** The month selected on the page; used for the "mensual" detail. */
  mes: number
  onEdit?: (bp: BrandPartner) => void
}

interface DetailState {
  bp: BrandPartner
  horasYear: BPHorasYearRow
  rentaYear: BPRentabilidadYearRow
}

export function BPDetailModal({
  open,
  onOpenChange,
  bp,
  activeTab,
  mes,
  onEdit,
}: BPDetailModalProps) {
  const [data, setData] = useState<DetailState | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<DetailMode>('mensual')
  // Local override for the displayed month — lets the user click a bar in
  // the annual view to jump into Mensual for that month, and use prev/next
  // to step through. Reset to the parent prop on (re)open / tab switch.
  const [internalMes, setInternalMes] = useState<number>(mes)

  // Reset internal toggle + month each time we (re)open for a fresh BP/tab.
  useEffect(() => {
    if (open) {
      setMode('mensual')
      setInternalMes(mes)
    }
    // We intentionally re-init internalMes on open/bp/activeTab changes only
    // — not on every parent `mes` change, so user navigation persists while
    // the modal stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bp, activeTab])

  useEffect(() => {
    if (!open || !bp) return
    let cancelled = false
    setLoading(true)
    setData(null)
    void (async () => {
      const snap = await getAnnualSnapshot()
      if (cancelled) return
      const fresh = snap.brandPartners.find(
        (b) => String(b.id) === String(bp.id)
      ) ?? bp
      setData({
        bp: fresh,
        horasYear: bpHorasYear(fresh, snap.asignaciones, snap.proyectos),
        rentaYear: bpRentabilidadYear(
          fresh,
          snap.asignaciones,
          snap.sueldos,
          snap.proyectos,
          snap.honorariosMensuales
        ),
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, bp])

  // Months in which this BP has at least one asignacion. Drives the bar
  // chart's clickable bars and the Mensual prev/next steppers.
  const activeMonthsHoras = useMemo(() => {
    if (!data) return [] as number[]
    return MONTHS.filter(
      (_m, i) => data.horasYear.byMonth[i].horasAsignadas > 0
    )
  }, [data])

  function jumpToMonth(m: number) {
    setInternalMes(m)
    setMode('mensual')
  }

  // Prev / next: step through the active months only. If the current
  // internalMes isn't itself active (BP has no asignacion in it), step
  // to the closest active month in the requested direction.
  function stepMonth(dir: -1 | 1) {
    if (activeMonthsHoras.length === 0) return
    const sorted = activeMonthsHoras
    if (dir === -1) {
      const candidate = [...sorted].reverse().find((m) => m < internalMes)
      if (candidate !== undefined) setInternalMes(candidate)
    } else {
      const candidate = sorted.find((m) => m > internalMes)
      if (candidate !== undefined) setInternalMes(candidate)
    }
  }

  const canPrev =
    activeMonthsHoras.length > 0 &&
    activeMonthsHoras.some((m) => m < internalMes)
  const canNext =
    activeMonthsHoras.length > 0 &&
    activeMonthsHoras.some((m) => m > internalMes)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">
                {bp?.nombre ?? 'Brand Partner'}
              </DialogTitle>
              <DialogDescription>
                {(data?.bp && displaySeniority(data.bp)) ??
                  (bp && displaySeniority(bp)) ??
                  '—'}{' '}
                · {activeTab === 'horas' ? 'Horas' : 'Rentabilidad'}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <ModeToggle value={mode} onChange={setMode} />
              {bp && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit?.(bp)}
                >
                  <Pencil className="w-3 h-3" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto">
          {loading || !data ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                <KpiSkeletonGrid count={4} />
              </div>
              <div className="mt-4">
                <TableSkeleton rows={5} />
              </div>
            </>
          ) : activeTab === 'horas' && mode === 'mensual' ? (
            <HorasMensual
              row={data.horasYear.byMonth[internalMes - 1]}
              mes={internalMes}
              onPrev={() => stepMonth(-1)}
              onNext={() => stepMonth(1)}
              canPrev={canPrev}
              canNext={canNext}
            />
          ) : activeTab === 'horas' && mode === 'anual' ? (
            <HorasAnual
              horasYear={data.horasYear}
              onMonthClick={jumpToMonth}
            />
          ) : activeTab === 'rentabilidad' && mode === 'mensual' ? (
            <RentabilidadMensual
              row={data.rentaYear.byMonth[internalMes - 1]}
              mes={internalMes}
            />
          ) : (
            <RentabilidadAnual rentaYear={data.rentaYear} />
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------------------
// Mode toggle
// --------------------------------------------------------------------------

function ModeToggle({
  value,
  onChange,
}: {
  value: DetailMode
  onChange: (m: DetailMode) => void
}) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {(['mensual', 'anual'] as DetailMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={cn(
            'px-3 py-1.5 text-2xs font-medium uppercase tracking-wider transition-colors',
            value === m
              ? 'bg-accent text-white'
              : 'bg-base text-secondary hover:bg-hover'
          )}
        >
          {m === 'mensual' ? 'Mensual' : 'Anual'}
        </button>
      ))}
    </div>
  )
}

// --------------------------------------------------------------------------
// HORAS — Mensual
// --------------------------------------------------------------------------

function HorasMensual({
  row,
  mes,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  row: ReturnType<typeof bpHorasMonthRow>
  mes: number
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
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

      <CompactStats
        items={[
          {
            label: 'Contratadas',
            value: formatHours(Math.round(row.horasContratadas)),
          },
          {
            label: 'Asignadas',
            value: formatHours(Math.round(row.horasAsignadas)),
          },
          {
            label: 'Libres',
            value: formatHours(Math.round(row.horasLibres)),
          },
          {
            label: '% ocupación',
            value: formatPercent(row.ocupacion),
            tone: occupationTone(row.ocupacion),
          },
        ]}
      />

      {row.byProject.length === 0 ? (
        <EmptyState message={`Sin asignaciones en ${getMonthLabel(mes)}.`} />
      ) : (
        <div className="bg-base border border-border rounded-lg overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Proyecto</Th>
                <Th align="right">Horas asignadas</Th>
              </tr>
            </thead>
            <tbody>
              {row.byProject.map((p) => (
                <tr
                  key={String(p.proyecto_id)}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 align-middle font-medium">
                    {p.proyecto_name}
                  </td>
                  <Td numeric>{formatHours(Math.round(p.horas))}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Compact stats — minimal label/value rows used in the Horas detail.
// --------------------------------------------------------------------------

type CompactTone = 'success' | 'warning' | 'danger' | undefined

function CompactStats({
  items,
}: {
  items: { label: string; value: string; tone?: CompactTone }[]
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="bg-base border border-border rounded-md px-3 py-2"
        >
          <div className="text-2xs uppercase tracking-wider text-tertiary">
            {it.label}
          </div>
          <div
            className={cn(
              'text-md font-mono tabular-nums font-medium',
              it.tone === 'success' && 'text-success',
              it.tone === 'warning' && 'text-warning',
              it.tone === 'danger' && 'text-danger'
            )}
          >
            {it.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function occupationTone(pct: number): CompactTone {
  if (pct >= 80) return 'success'
  if (pct >= 50) return 'warning'
  return 'danger'
}

// --------------------------------------------------------------------------
// HORAS — Anual
// --------------------------------------------------------------------------

function HorasAnual({
  horasYear,
  onMonthClick,
}: {
  horasYear: BPHorasYearRow
  onMonthClick?: (mes: number) => void
}) {
  // Only include months where this BP has at least one asignacion.
  const activeMonths = useMemo(
    () => MONTHS.filter((_m, i) => horasYear.byMonth[i].horasAsignadas > 0),
    [horasYear]
  )

  if (activeMonths.length === 0) {
    return <EmptyState message="Sin asignaciones cargadas en el año." />
  }

  // One data point per active month: x = month label, y = % ocupación.
  // `mesNum` is the 1-12 number used for click-to-jump.
  const data = activeMonths.map((m) => {
    const r = horasYear.byMonth[m - 1]
    return {
      mes: getMonthLabel(m).slice(0, 3),
      mesNum: m,
      ocupacion: Math.round(r.ocupacion * 10) / 10,
      libres: r.horasLibres,
      asignadas: r.horasAsignadas,
      contratadas: r.horasContratadas,
    }
  })

  // Year aggregates use only active months.
  const activeRows = activeMonths.map((m) => horasYear.byMonth[m - 1])
  const totalAsignadas = activeRows.reduce((s, m) => s + m.horasAsignadas, 0)
  const totalContratadas = activeRows.reduce(
    (s, m) => s + m.horasContratadas,
    0
  )
  const totalLibres = Math.max(0, totalContratadas - totalAsignadas)
  const ocupAvg =
    totalContratadas > 0 ? (totalAsignadas / totalContratadas) * 100 : 0

  // Chart needs to fit the 100% reference line, so domain max is at least 110.
  const maxY = Math.max(110, ...data.map((d) => d.ocupacion + 10))

  return (
    <div className="flex flex-col gap-4">
      <CompactStats
        items={[
          {
            label: 'Asignadas año',
            value: formatHours(Math.round(totalAsignadas)),
          },
          {
            label: 'Contratadas año',
            value: formatHours(Math.round(totalContratadas)),
          },
          {
            label: 'Libres año',
            value: formatHours(Math.round(totalLibres)),
          },
          {
            label: '% ocupación',
            value: formatPercent(ocupAvg),
            tone: occupationTone(ocupAvg),
          },
        ]}
      />

      <div className="bg-base border border-border rounded-lg p-3">
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="text-2xs uppercase tracking-wider text-tertiary">
            % ocupación por mes
          </div>
          {onMonthClick && (
            <div className="text-2xs text-tertiary italic">
              Clickeá un mes para ver el detalle
            </div>
          )}
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="mes"
                tick={(props) => <MonthLibresTick {...props} data={data} />}
                stroke="var(--border)"
                interval={0}
                height={36}
              />
              <YAxis
                domain={[0, maxY]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                stroke="var(--border)"
                width={44}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(_v: number, _n: string, item) => {
                  const d = item.payload as (typeof data)[number]
                  return [
                    `${d.ocupacion}% · ${formatHours(Math.round(d.asignadas))} de ${formatHours(Math.round(d.contratadas))}`,
                    'Ocupación',
                  ]
                }}
                labelStyle={{ color: 'var(--text-primary)', fontWeight: 500 }}
              />
              <ReferenceLine
                y={100}
                stroke="var(--text-tertiary)"
                strokeDasharray="4 4"
                label={{
                  value: '100%',
                  position: 'right',
                  fontSize: 10,
                  fill: 'var(--text-tertiary)',
                }}
              />
              <Bar
                dataKey="ocupacion"
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
                cursor={onMonthClick ? 'pointer' : 'default'}
                onClick={(d: { mesNum?: number }) => {
                  if (onMonthClick && typeof d.mesNum === 'number') {
                    onMonthClick(d.mesNum)
                  }
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

/** Custom XAxis tick: month label + libres (smaller, secondary). */
function MonthLibresTick(props: {
  x?: number
  y?: number
  payload?: { value: string; index: number }
  data: { mes: string; libres: number }[]
}) {
  const { x = 0, y = 0, payload, data } = props
  if (!payload) return null
  const row = data[payload.index]
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        textAnchor="middle"
        dy={12}
        style={{ fontSize: 11, fill: 'var(--text-secondary)' }}
      >
        {payload.value}
      </text>
      <text
        textAnchor="middle"
        dy={26}
        style={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
      >
        {row && row.libres > 0 ? `${Math.round(row.libres)}h libres` : ''}
      </text>
    </g>
  )
}

// --------------------------------------------------------------------------
// RENTABILIDAD — Mensual
// --------------------------------------------------------------------------

function RentabilidadMensual({
  row,
  mes,
}: {
  row: ReturnType<typeof bpRentabilidadMonthRow>
  mes: number
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Sueldo"
          value={
            row.sueldoMensual > 0 ? formatCurrency(row.sueldoMensual) : '—'
          }
          meta={getMonthLabel(mes)}
        />
        <KpiCard
          label="Ingreso cotizado"
          value={
            row.ingresoCotizado > 0 ? formatCurrency(row.ingresoCotizado) : '—'
          }
        />
        <KpiCard
          label="Costo real"
          value={row.costo > 0 ? formatCurrency(row.costo) : '—'}
        />
        <KpiCard
          label="Margen"
          value={row.ingresoCotizado > 0 ? formatCurrency(row.margen) : '—'}
          meta={
            row.ingresoCotizado > 0
              ? formatPercent(row.margenPercent)
              : 'sin ingresos'
          }
        />
      </div>

      {row.byProject.length === 0 ? (
        <EmptyState message={`Sin asignaciones en ${getMonthLabel(mes)}.`} />
      ) : (
        <div>
          <h3 className="text-sm font-semibold tracking-snug mb-3">
            Detalle por proyecto
          </h3>
          <div className="bg-base border border-border rounded-lg overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th>Proyecto</Th>
                  <Th align="right">Horas</Th>
                  <Th align="right">Valor/h proy.</Th>
                  <Th align="right">Valor/h BP</Th>
                  <Th align="right">Ingreso</Th>
                  <Th align="right">Costo</Th>
                  <Th align="right">Margen</Th>
                </tr>
              </thead>
              <tbody>
                {row.byProject.map((p) => (
                  <tr
                    key={String(p.proyecto_id)}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 align-middle font-medium whitespace-nowrap">
                      {p.proyecto_name}
                    </td>
                    <Td numeric>{formatHours(Math.round(p.horas))}</Td>
                    <Td numeric>{formatCurrency(p.valorHoraProyecto)}</Td>
                    <Td numeric>{formatCurrency(p.valorHoraBP)}</Td>
                    <Td numeric>{formatCurrency(p.ingreso)}</Td>
                    <Td numeric>{formatCurrency(p.costo)}</Td>
                    <Td numeric>
                      <span
                        className={cn(
                          'font-medium',
                          p.margen < 0
                            ? 'text-danger'
                            : p.margen > 0
                              ? 'text-success'
                              : 'text-tertiary'
                        )}
                      >
                        {formatCurrency(p.margen)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// RENTABILIDAD — Anual
// --------------------------------------------------------------------------

function RentabilidadAnual({ rentaYear }: { rentaYear: BPRentabilidadYearRow }) {
  // Only include months where this BP has at least one asignacion.
  const activeMonths = useMemo(
    () =>
      MONTHS.filter((_m, i) => rentaYear.byMonth[i].byProject.length > 0),
    [rentaYear]
  )

  const data = activeMonths.map((m) => {
    const row = rentaYear.byMonth[m - 1]
    return {
      mes: getMonthLabel(m).slice(0, 3),
      margen: row.margen,
      ingreso: row.ingresoCotizado,
      costo: row.costo,
    }
  })
  const activeRows = activeMonths.map((m) => rentaYear.byMonth[m - 1])
  const totalIngreso = activeRows.reduce((s, m) => s + m.ingresoCotizado, 0)
  const totalCosto = activeRows.reduce((s, m) => s + m.costo, 0)
  const totalMargen = totalIngreso - totalCosto
  const margenPct = totalIngreso > 0 ? (totalMargen / totalIngreso) * 100 : 0

  if (activeMonths.length === 0) {
    return <EmptyState message="Sin asignaciones cargadas en el año." />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Ingreso año"
          value={totalIngreso > 0 ? formatCurrency(totalIngreso) : '—'}
        />
        <KpiCard
          label="Costo año"
          value={totalCosto > 0 ? formatCurrency(totalCosto) : '—'}
        />
        <KpiCard
          label="Margen año"
          value={totalIngreso > 0 ? formatCurrency(totalMargen) : '—'}
        />
        <KpiCard
          label="% margen"
          value={totalIngreso > 0 ? formatPercent(margenPct) : '—'}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold tracking-snug mb-3">
          Margen mes a mes
        </h3>
        <div className="bg-base border border-border rounded-lg p-3">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  stroke="var(--border)"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  stroke="var(--border)"
                  width={60}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v: number) => formatCurrency(v)}
                  labelStyle={{ color: 'var(--text-primary)', fontWeight: 500 }}
                />
                <Bar dataKey="margen" name="Margen" radius={[4, 4, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.margen < 0
                          ? 'var(--danger)'
                          : d.margen > 0
                            ? 'var(--success)'
                            : 'var(--text-tertiary)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-base border border-border rounded-lg overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <Th>Mes</Th>
              <Th align="right">Ingreso</Th>
              <Th align="right">Costo</Th>
              <Th align="right">Margen</Th>
              <Th align="right">% margen</Th>
            </tr>
          </thead>
          <tbody>
            {activeMonths.map((m) => {
              const row = rentaYear.byMonth[m - 1]
              return (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {getMonthLabel(m)}
                  </td>
                  <Td numeric>
                    {row.ingresoCotizado > 0
                      ? formatCurrency(row.ingresoCotizado)
                      : '—'}
                  </Td>
                  <Td numeric>
                    {row.costo > 0 ? formatCurrency(row.costo) : '—'}
                  </Td>
                  <Td numeric>
                    {row.ingresoCotizado > 0 ? (
                      <span
                        className={cn(
                          'font-medium',
                          row.margen < 0
                            ? 'text-danger'
                            : row.margen > 0
                              ? 'text-success'
                              : 'text-tertiary'
                        )}
                      >
                        {formatCurrency(row.margen)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td numeric>
                    {row.ingresoCotizado > 0
                      ? formatPercent(row.margenPercent)
                      : '—'}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return formatCurrency(v)
}

// --------------------------------------------------------------------------
// Table cell helpers
// --------------------------------------------------------------------------

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={cn(
        'sticky top-0 z-10 bg-base border-b border-border font-medium uppercase tracking-wider text-tertiary',
        'px-3 py-2 text-2xs',
        align === 'right' ? 'text-right' : 'text-left'
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  numeric,
}: {
  children: React.ReactNode
  numeric?: boolean
}) {
  return (
    <td
      className={cn(
        'align-middle px-3 py-2 text-sm',
        numeric && 'font-mono tabular-nums text-right'
      )}
    >
      {children}
    </td>
  )
}

