import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
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

interface ProjectDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proyecto: Proyecto | null
  onEdit?: (p: Proyecto) => void
}

interface DetailState {
  proyecto: Proyecto
  totalHoras: number
  totalRevenue: number
  totalCost: number
  marginPercent: number
  bps: ProjectBPBreakdown[]
}

export function ProjectDetailModal({
  open,
  onOpenChange,
  proyecto,
  onEdit,
}: ProjectDetailModalProps) {
  const [data, setData] = useState<DetailState | null>(null)
  const [loading, setLoading] = useState(false)

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
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, proyecto])

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
                {data?.proyecto.tipo
                  ? `${data.proyecto.tipo} · `
                  : ''}
                Distribución anual
              </DialogDescription>
            </div>
            {proyecto && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onEdit?.(proyecto)}
                className="mt-1"
              >
                <Pencil className="w-3 h-3" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {loading || !data ? (
              <KpiSkeletonGrid count={4} />
            ) : (
              <>
                <KpiCard
                  label="Ingresos año"
                  value={formatCurrency(data.totalRevenue)}
                />
                <KpiCard
                  label="Costo año"
                  value={formatCurrency(data.totalCost)}
                />
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
              </>
            )}
          </div>

          {/* Distribution */}
          <div>
            <h3 className="text-sm font-semibold tracking-snug mb-3">
              Distribución de Brand Partners
            </h3>
            {loading || !data ? (
              <div className="flex flex-col gap-4">
                <div className="bg-base border border-border rounded-lg h-[280px]" />
                <TableSkeleton rows={5} />
              </div>
            ) : data.bps.length === 0 ? (
              <EmptyState message="No hay asignaciones registradas para este proyecto." />
            ) : (
              <div className="flex flex-col gap-4">
                <RevenueVsCostsChart bps={data.bps} />
                <BPsMarginTable bps={data.bps} />
              </div>
            )}
          </div>
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

function RevenueVsCostsChart({ bps }: { bps: ProjectBPBreakdown[] }) {
  const chartData = bps.map((b) => ({
    name: b.bp_name,
    Ingresos: Math.round(b.ingresosAnuales),
    Costos: Math.round(b.costosAnuales),
  }))
  return (
    <div className="bg-base border border-border rounded-lg p-3">
      <div className="flex items-center justify-between text-2xs font-medium uppercase tracking-wider text-secondary px-1 mb-2">
        <span>Ingresos vs Costos por BP</span>
        <span className="text-tertiary normal-case tracking-normal">
          La diferencia (azul − rojo) es el margen anual
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
            <Bar dataKey="Ingresos" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Costos" fill="var(--danger)" radius={[3, 3, 0, 0]} />
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
