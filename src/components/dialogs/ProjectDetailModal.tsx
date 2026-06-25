import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { MonthNav } from '@/components/ui/month-nav'
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge'
import {
  formatCurrency,
  formatHours,
  formatNumber,
  formatPercent,
} from '@/lib/format'
import { getProjectDetailFull, type Proyecto } from '@/lib/queries'
import { displaySeniority } from '@/lib/seniority'
import type {
  BPProjectEstado,
  ProjectBPBreakdown,
} from '@/lib/calculations'
import { cn } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

const ESTADO_LABEL: Record<BPProjectEstado, string> = {
  rentable: 'Rentable',
  neutral: 'Neutral',
  perdida: 'Pérdida',
}

const ESTADO_VARIANT: Record<BPProjectEstado, StatusVariant> = {
  rentable: 'active',
  neutral: 'idle',
  perdida: 'over',
}

type DetailMode = 'mensual' | 'anual'

interface ProjectDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proyecto: Proyecto | null
  /** Optional starting month for the Mensual view. Defaults to current month. */
  mes?: number
  onEdit?: (p: Proyecto) => void
}

interface DetailState {
  proyecto: Proyecto
  totalHoras: number
  totalRevenue: number
  totalCost: number
  marginPercent: number
  bps: ProjectBPBreakdown[]
  honorariosMensuales: { mes: number; honorarios: number }[]
}

const defaultMes = () => new Date().getMonth() + 1

export function ProjectDetailModal({
  open,
  onOpenChange,
  proyecto,
  mes,
  onEdit,
}: ProjectDetailModalProps) {
  const [data, setData] = useState<DetailState | null>(null)
  const [loading, setLoading] = useState(false)
  // Default to Anual: project-level summary is the typical first view.
  const [mode, setMode] = useState<DetailMode>('anual')
  const [internalMes, setInternalMes] = useState<number>(mes ?? defaultMes())

  useEffect(() => {
    if (open) {
      setMode('anual')
      setInternalMes(mes ?? defaultMes())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proyecto])

  useEffect(() => {
    if (!open || !proyecto) return
    let cancelled = false
    setLoading(true)
    setData(null)
    void (async () => {
      const detail = await getProjectDetailFull(proyecto.id)
      if (cancelled) return
      const row = detail.proyecto ?? proyecto
      setData({
        proyecto: row,
        totalHoras: detail.totalHoras,
        totalRevenue: detail.totalRevenue,
        totalCost: detail.totalCost,
        marginPercent: detail.marginPercent,
        bps: detail.bps,
        honorariosMensuales: detail.honorariosMensuales,
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, proyecto])

  // Months in which this project has at least one asignacion OR booked
  // honorarios — drives the clickable bars and the prev/next steppers.
  const activeMonths = useMemo(() => {
    if (!data) return [] as number[]
    return MONTHS.filter((m) => {
      const hasHoras = data.bps.some((b) => b.horasPorMes[m - 1] > 0)
      const hasHonorarios = (data.honorariosMensuales.find((h) => h.mes === m)
        ?.honorarios ?? 0) > 0
      return hasHoras || hasHonorarios
    })
  }, [data])

  function jumpToMonth(m: number) {
    setInternalMes(m)
    setMode('mensual')
  }
  function stepMonth(dir: -1 | 1) {
    if (activeMonths.length === 0) return
    if (dir === -1) {
      const candidate = [...activeMonths].reverse().find((m) => m < internalMes)
      if (candidate !== undefined) setInternalMes(candidate)
    } else {
      const candidate = activeMonths.find((m) => m > internalMes)
      if (candidate !== undefined) setInternalMes(candidate)
    }
  }
  const canPrev =
    activeMonths.length > 0 && activeMonths.some((m) => m < internalMes)
  const canNext =
    activeMonths.length > 0 && activeMonths.some((m) => m > internalMes)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">
                {proyecto?.nombre ?? 'Proyecto'}
              </DialogTitle>
              <DialogDescription>
                {data?.proyecto.tipo ? `${data.proyecto.tipo} · ` : ''}
                {mode === 'anual'
                  ? 'Distribución anual'
                  : getMonthLabel(internalMes)}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <ModeToggle value={mode} onChange={setMode} />
              {proyecto && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit?.(proyecto)}
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiSkeletonGrid count={4} />
              </div>
              <div className="mt-4">
                <TableSkeleton rows={5} />
              </div>
            </>
          ) : mode === 'anual' ? (
            <ProjectAnualView data={data} onMonthClick={jumpToMonth} />
          ) : (
            <ProjectMensualView
              data={data}
              mes={internalMes}
              onPrev={() => stepMonth(-1)}
              onNext={() => stepMonth(1)}
              canPrev={canPrev}
              canNext={canNext}
            />
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
// Mode toggle (matches the one in BPDetailModal)
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
// ANUAL view
// --------------------------------------------------------------------------

function ProjectAnualView({
  data,
  onMonthClick,
}: {
  data: DetailState
  onMonthClick: (m: number) => void
}) {
  // Per-month aggregates derived from the BP breakdowns + booked honorarios.
  const perMonth = useMemo(() => {
    const honorariosMap = new Map(
      data.honorariosMensuales.map((h) => [h.mes, Number(h.honorarios) || 0])
    )
    return MONTHS.map((m) => {
      const i = m - 1
      const horas = data.bps.reduce((s, b) => s + (b.horasPorMes[i] ?? 0), 0)
      const costo = data.bps.reduce((s, b) => s + (b.costosPorMes[i] ?? 0), 0)
      const ingreso = honorariosMap.get(m) ?? 0
      const margen = ingreso - costo
      return { mes: m, horas, costo, ingreso, margen }
    })
  }, [data])

  // Drop months with no data — keeps the chart focused on what's loaded.
  const activeMonths = perMonth.filter(
    (m) => m.horas > 0 || m.ingreso > 0 || m.costo > 0
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Ingresos año"
          value={formatCurrency(data.totalRevenue)}
        />
        <KpiCard label="Costo año" value={formatCurrency(data.totalCost)} />
        <KpiCard
          label="Margen"
          value={formatPercent(data.marginPercent)}
          meta={formatCurrency(data.totalRevenue - data.totalCost)}
        />
        <KpiCard
          label="Horas totales"
          value={formatHours(Math.round(data.totalHoras))}
          meta={`${data.bps.length} BPs`}
        />
      </div>

      {activeMonths.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold tracking-snug">
              Margen por mes
            </h3>
            <div className="text-2xs text-tertiary italic">
              Clickeá un mes para ver el detalle
            </div>
          </div>
          <div className="bg-base border border-border rounded-lg p-3">
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeMonths.map((m) => ({
                    name: getMonthLabel(m.mes).slice(0, 3),
                    mesNum: m.mes,
                    Ingreso: Math.round(m.ingreso),
                    Costo: Math.round(m.costo),
                    Margen: Math.round(m.margen),
                  }))}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCurrencyCompact(v)}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    cursor={{ fill: 'var(--bg-hover)' }}
                    formatter={(v: number, name: string) => [
                      formatCurrency(v),
                      name,
                    ]}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                    }}
                  />
                  <Bar
                    dataKey="Ingreso"
                    fill="var(--accent)"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(d: { mesNum?: number }) =>
                      typeof d.mesNum === 'number' && onMonthClick(d.mesNum)
                    }
                  />
                  <Bar
                    dataKey="Costo"
                    fill="var(--text-tertiary)"
                    fillOpacity={0.55}
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(d: { mesNum?: number }) =>
                      typeof d.mesNum === 'number' && onMonthClick(d.mesNum)
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {data.bps.length === 0 ? (
        <EmptyState message="No hay asignaciones registradas para este proyecto." />
      ) : (
        <div className="flex flex-col gap-4">
          <RevenueVsCostsChart bps={data.bps} />
          <BPsMarginTable bps={data.bps} />
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// MENSUAL view
// --------------------------------------------------------------------------

function ProjectMensualView({
  data,
  mes,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  data: DetailState
  mes: number
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}) {
  const i = mes - 1
  const ingreso =
    Number(
      data.honorariosMensuales.find((h) => h.mes === mes)?.honorarios ?? 0
    ) || 0
  const bpsDelMes = data.bps
    .map((b) => ({
      bp_id: b.bp_id,
      bp: b.bp,
      bp_name: b.bp_name,
      horas: b.horasPorMes[i] ?? 0,
      costo: b.costosPorMes[i] ?? 0,
      ingresoRef: b.ingresosPorMes[i] ?? 0,
      // Per-month project rate (capped when over budget), NOT the yearly
      // average — so the column reconciles with Ingreso ref. for this mes.
      ratePerHourProyecto: b.ratePerHourProyectoPorMes[i] ?? 0,
      ratePerHourBp: b.ratePerHourBpPorMes[i] ?? 0,
    }))
    .filter((b) => b.horas > 0 || b.costo > 0)
    .sort((a, b) => b.horas - a.horas)

  const horas = bpsDelMes.reduce((s, b) => s + b.horas, 0)
  const costo = bpsDelMes.reduce((s, b) => s + b.costo, 0)
  const margen = ingreso - costo
  const marginPercent = ingreso > 0 ? (margen / ingreso) * 100 : 0

  return (
    <div className="flex flex-col gap-4">
      <MonthNav
        mes={mes}
        onPrev={onPrev}
        onNext={onNext}
        canPrev={canPrev}
        canNext={canNext}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Ingreso del mes"
          value={ingreso > 0 ? formatCurrency(ingreso) : '—'}
        />
        <KpiCard
          label="Costo del mes"
          value={costo > 0 ? formatCurrency(costo) : '—'}
        />
        <KpiCard
          label="Margen del mes"
          value={ingreso > 0 ? formatCurrency(margen) : '—'}
          meta={ingreso > 0 ? formatPercent(marginPercent) : 'sin ingreso'}
        />
        <KpiCard
          label="Horas del mes"
          value={formatHours(Math.round(horas))}
          meta={`${bpsDelMes.length} BPs`}
        />
      </div>

      {bpsDelMes.length === 0 ? (
        <EmptyState message={`Sin asignaciones en ${getMonthLabel(mes)}.`} />
      ) : (
        <>
          <div className="bg-base border border-border rounded-lg p-3">
            <div className="text-2xs font-medium uppercase tracking-wider text-secondary px-1 mb-2">
              Ingreso vs Costo por BP — {getMonthLabel(mes)}
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bpsDelMes.map((b) => ({
                    name: b.bp_name,
                    'Ref. ingreso': Math.round(b.ingresoRef),
                    'Costo BP': Math.round(b.costo),
                    profitable: b.ingresoRef > b.costo,
                  }))}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCurrencyCompact(v)}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    cursor={{ fill: 'var(--bg-hover)' }}
                    formatter={(v: number, name: string) => [
                      formatCurrency(v),
                      name,
                    ]}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                    }}
                  />
                  <Bar dataKey="Ref. ingreso" radius={[3, 3, 0, 0]}>
                    {bpsDelMes.map((b, idx) => (
                      <Cell
                        key={idx}
                        fill={
                          b.ingresoRef > b.costo
                            ? 'var(--success)'
                            : 'var(--danger)'
                        }
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="Costo BP"
                    fill="var(--text-tertiary)"
                    fillOpacity={0.55}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-base border border-border rounded-lg overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th>BP</Th>
                  <Th numeric>Horas</Th>
                  <Th numeric>$/h proy.</Th>
                  <Th numeric>$/h BP</Th>
                  <Th numeric>Ingreso ref.</Th>
                  <Th numeric>Costo</Th>
                  <Th numeric>Margen</Th>
                </tr>
              </thead>
              <tbody>
                {bpsDelMes.map((b) => {
                  // BP rate for this specific mes: sueldo[mes] / cap_bp
                  // (pre-computed in buildBPsForProject).
                  const ratePerHourBp = b.ratePerHourBp
                  const m = b.ingresoRef - b.costo
                  return (
                    <tr
                      key={b.bp_id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 align-middle">
                        <div className="flex flex-col gap-0.5 min-w-[140px]">
                          <span className="font-medium whitespace-nowrap">
                            {b.bp_name}
                          </span>
                          {b.bp && displaySeniority(b.bp) && (
                            <span className="text-2xs text-tertiary">
                              {displaySeniority(b.bp)}
                            </span>
                          )}
                        </div>
                      </td>
                      <Td numeric>{formatHours(Math.round(b.horas))}</Td>
                      <Td numeric>
                        {formatCurrency(b.ratePerHourProyecto, 2)}
                      </Td>
                      <Td numeric>
                        {ratePerHourBp > 0
                          ? formatCurrency(ratePerHourBp, 2)
                          : '—'}
                      </Td>
                      <Td numeric>{formatCurrency(b.ingresoRef)}</Td>
                      <Td numeric>{formatCurrency(b.costo)}</Td>
                      <Td numeric>
                        <span
                          className={cn(
                            'font-medium',
                            m < 0
                              ? 'text-danger'
                              : m > 0
                                ? 'text-success'
                                : 'text-tertiary'
                          )}
                        >
                          {formatCurrency(m)}
                        </span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------

function RevenueVsCostsChart({ bps }: { bps: ProjectBPBreakdown[] }) {
  const chartData = bps.map((b) => ({
    name: b.bp_name,
    'Ref. ingreso': Math.round(b.ingresosAnuales),
    'Costo BP': Math.round(b.costosAnuales),
    /** Sign of the per-BP margin — drives the reference-bar tint. */
    profitable: b.ingresosAnuales > b.costosAnuales,
  }))
  return (
    <div className="bg-base border border-border rounded-lg p-3">
      <div className="flex items-center justify-between text-2xs font-medium uppercase tracking-wider text-secondary px-1 mb-2">
        <span>Ingreso vs Costo por BP (año)</span>
        <span className="text-tertiary normal-case tracking-normal">
          Ref. ingreso = horas × $/h proyecto · Costo = horas × $/h BP
        </span>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              stroke="var(--text-tertiary)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={56}
            />
            <YAxis
              stroke="var(--text-tertiary)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatCurrencyCompact(v)}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              cursor={{ fill: 'var(--bg-hover)' }}
              formatter={(v: number, name: string) => [formatCurrency(v), name]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
            />
            <Bar dataKey="Ref. ingreso" radius={[3, 3, 0, 0]}>
              {chartData.map((row, i) => (
                <Cell
                  key={i}
                  fill={row.profitable ? 'var(--success)' : 'var(--danger)'}
                />
              ))}
            </Bar>
            <Bar
              dataKey="Costo BP"
              fill="var(--text-tertiary)"
              fillOpacity={0.55}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function BPsMarginTable({ bps }: { bps: ProjectBPBreakdown[] }) {
  return (
    <div className="bg-base border border-border rounded-lg overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <Th sticky>BP</Th>
            <Th numeric>Total</Th>
            {MONTHS.map((m) => (
              <Th key={m} numeric compact>
                {getMonthLabel(m).slice(0, 3)}
              </Th>
            ))}
            <Th numeric>$/h proy.</Th>
            <Th numeric>$/h BP</Th>
            <Th numeric>Margen</Th>
            <Th align="left">Estado</Th>
          </tr>
        </thead>
        <tbody>
          {bps.map((b) => (
            <tr
              key={b.bp_id}
              className="border-b border-border last:border-0"
            >
              <td className="sticky left-0 z-10 bg-base px-3 py-2 align-middle border-r border-border">
                <div className="flex flex-col gap-0.5 min-w-[140px]">
                  <span className="font-medium whitespace-nowrap">
                    {b.bp_name}
                  </span>
                  {b.bp && displaySeniority(b.bp) && (
                    <span className="text-2xs text-tertiary">
                      {displaySeniority(b.bp)}
                    </span>
                  )}
                </div>
              </td>
              <Td numeric>{formatHours(Math.round(b.totalHoras))}</Td>
              {MONTHS.map((m) => {
                const v = b.horasPorMes[m - 1] ?? 0
                return (
                  <Td key={m} numeric compact>
                    {v > 0 ? (
                      formatNumber(v, 0)
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </Td>
                )
              })}
              <Td numeric>{formatCurrency(b.ratePerHourProyecto, 2)}</Td>
              <Td numeric>
                {b.ratePerHourBpAvg > 0
                  ? formatCurrency(b.ratePerHourBpAvg, 2)
                  : '—'}
              </Td>
              <Td numeric>
                <MarginPct value={b.marginPercent} />
              </Td>
              <td className="px-3 py-2 align-middle">
                <StatusBadge
                  variant={ESTADO_VARIANT[b.estado]}
                  label={ESTADO_LABEL[b.estado]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarginPct({ value }: { value: number }) {
  const color =
    value > 20
      ? 'var(--success)'
      : value > 0
        ? 'var(--warning)'
        : 'var(--danger)'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return (
    <span style={{ color }}>
      {sign}
      {formatNumber(Math.abs(value), 1)}%
    </span>
  )
}

// --------------------------------------------------------------------------

function Th({
  children,
  align = 'left',
  numeric,
  compact,
  sticky,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  numeric?: boolean
  compact?: boolean
  sticky?: boolean
}) {
  return (
    <th
      className={cn(
        'bg-base border-b border-border font-medium uppercase tracking-wider text-tertiary',
        compact ? 'px-1.5 py-2 text-[10px]' : 'px-3 py-2 text-2xs',
        numeric || align === 'right' ? 'text-right' : 'text-left',
        sticky && 'sticky left-0 z-20 border-r border-border'
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  numeric,
  compact,
}: {
  children: React.ReactNode
  numeric?: boolean
  compact?: boolean
}) {
  return (
    <td
      className={cn(
        'align-middle',
        compact ? 'px-1.5 py-1.5 text-2xs' : 'px-3 py-2 text-sm',
        numeric && 'font-mono tabular-nums text-right'
      )}
    >
      {children}
    </td>
  )
}

/** "$1.2K" / "$45K" / "$1.2M" — short for chart Y-axis ticks. */
function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000) return `$${formatNumber(value / 1_000_000, 1)}M`
  if (value >= 1_000) return `$${formatNumber(value / 1_000, 0)}K`
  return formatCurrency(value, 0)
}
