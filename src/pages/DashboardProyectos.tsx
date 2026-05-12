import { useCallback, useEffect, useMemo, useState } from 'react'
import { Coins, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader } from '@/components/layout/page-header'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import {
  NewProjectDialog,
  TIPO_OPTIONS,
} from '@/components/dialogs/NewProjectDialog'
import { EditProjectDialog } from '@/components/dialogs/EditProjectDialog'
import { ProjectDetailModal } from '@/components/dialogs/ProjectDetailModal'
import { ProjectHonorarioFullYearModal } from '@/components/dialogs/ProjectHonorarioFullYearModal'
import { Button } from '@/components/ui/button'
import { ChartCard, chartTooltipStyle } from '@/components/ui/chart-card'
import {
  DataTable,
  type DataTableColumn,
} from '@/components/ui/data-table'
import { KpiCard } from '@/components/ui/kpi-card'
import {
  EmptyState,
  ErrorBanner,
  KpiSkeletonGrid,
  ListSkeleton,
  TableSkeleton,
} from '@/components/ui/loading-states'
import { MonthPicker, getMonthLabel } from '@/components/ui/month-picker'
import { MultiSelect } from '@/components/ui/multi-select'
import { Section } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge'
import { UtilizationBar } from '@/components/ui/utilization-bar'
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle'
import {
  formatCompactCurrency,
  formatCompactHours,
  formatCurrency,
  formatHours,
  formatNumber,
  formatPercent,
} from '@/lib/format'
import {
  HOURS_PER_MONTH,
  calculateBPCosts,
  calculateIdleHours,
  calculateMargin,
  calculateMonthlyRevenue,
  aggregateRentabilidad,
  calculateProyectosAnnualKpis,
  summarizeAllProjects,
  summarizeAllProjectsRentabilidad,
  summarizeProjectsAnnual,
  type AggregatedRentabilidad,
  type ProjectAnnualSummary,
  type ProjectMonthSummary,
  type ProyectosAnnualKpis,
} from '@/lib/calculations'
import {
  deleteProyecto,
  getAnnualSnapshot,
  getDashboardSnapshot,
  type AnnualSnapshot,
  type DashboardSnapshot,
  type Proyecto,
} from '@/lib/queries'
import { matchesQuery, useSearch } from '@/hooks/useSearch'

// --------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear()
const defaultMonth = () => new Date().getMonth() + 1
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function statusVariantFor(raw: string | null | undefined): {
  variant: StatusVariant
  label: string
} {
  const v = (raw ?? '').toLowerCase().trim()
  if (['activo', 'active', 'on-track'].includes(v)) {
    return { variant: 'active', label: 'Activo' }
  }
  if (['idle', 'pausado', 'paused', 'pause'].includes(v)) {
    return { variant: 'idle', label: 'Idle' }
  }
  if (['perdido', 'pierde', 'over', 'risk', 'en riesgo'].includes(v)) {
    return { variant: 'over', label: 'Pierde' }
  }
  return { variant: 'neutral', label: raw ? raw : '—' }
}

interface MonthlyData {
  mode: 'monthly'
  snapshot: DashboardSnapshot
  revenue: number
  costs: number
  idleHours: number
  marginPercent: number
  projectSummaries: ProjectMonthSummary[]
  rentabilidad: AggregatedRentabilidad
}

interface AnnualData {
  mode: 'annual'
  snapshot: AnnualSnapshot
  kpis: ProyectosAnnualKpis
  projects: ProjectAnnualSummary[]
  rentabilidad: AggregatedRentabilidad
}

type PageData = MonthlyData | AnnualData

function deriveMonthly(snapshot: DashboardSnapshot, mes: number): MonthlyData {
  const revenue = calculateMonthlyRevenue(
    snapshot.proyectos,
    snapshot.asignaciones,
    mes,
    snapshot.honorariosMensuales
  )
  const costs = calculateBPCosts(snapshot.asignaciones, snapshot.sueldos, mes)
  // Rentabilidad uses month-scoped asignaciones to match the displayed mes.
  const monthAsignaciones = snapshot.asignaciones.filter((a) => a.mes === mes)
  const rentabilidad = aggregateRentabilidad(
    summarizeAllProjectsRentabilidad(
      snapshot.proyectos,
      monthAsignaciones,
      snapshot.brandPartners
    )
  )
  return {
    mode: 'monthly',
    snapshot,
    revenue,
    costs,
    idleHours: calculateIdleHours(snapshot.brandPartners, snapshot.asignaciones, mes),
    marginPercent: calculateMargin(revenue, costs),
    projectSummaries: summarizeAllProjects(
      snapshot.proyectos,
      snapshot.asignaciones,
      snapshot.sueldos,
      mes,
      snapshot.brandPartners,
      snapshot.honorariosMensuales
    ),
    rentabilidad,
  }
}

function deriveAnnual(snapshot: AnnualSnapshot): AnnualData {
  const rentabilidad = aggregateRentabilidad(
    summarizeAllProjectsRentabilidad(
      snapshot.proyectos,
      snapshot.asignaciones,
      snapshot.brandPartners
    )
  )
  return {
    mode: 'annual',
    snapshot,
    kpis: calculateProyectosAnnualKpis(
      snapshot.proyectos,
      snapshot.brandPartners,
      snapshot.asignaciones,
      snapshot.sueldos,
      snapshot.honorariosMensuales
    ),
    projects: summarizeProjectsAnnual(
      snapshot.proyectos,
      snapshot.asignaciones,
      snapshot.sueldos,
      snapshot.brandPartners,
      snapshot.honorariosMensuales
    ),
    rentabilidad,
  }
}

// --------------------------------------------------------------------------

export function DashboardProyectos() {
  const [viewMode, setViewMode] = useState<ViewMode>('annual')
  const [mes, setMes] = useState<number>(defaultMonth)
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openNew, setOpenNew] = useState(false)
  const [editingProyecto, setEditingProyecto] = useState<Proyecto | null>(null)
  const [detailingProyecto, setDetailingProyecto] = useState<Proyecto | null>(null)
  const [honorariosProyecto, setHonorariosProyecto] = useState<Proyecto | null>(null)
  const [deletingProyecto, setDeletingProyecto] = useState<Proyecto | null>(null)
  // Multi-select: empty array = none selected (matches nothing); array of
  // length === TIPO_OPTIONS.length = all selected (matches everything).
  // Initialized to "all selected" so the default view shows every project.
  const [tipoFilter, setTipoFilter] = useState<string[]>(() => [
    ...TIPO_OPTIONS,
  ])

  const { query: searchQuery } = useSearch()

  const fetchData = useCallback(
    async (mode: ViewMode, selectedMes: number) => {
      setLoading(true)
      setError(null)
      try {
        if (mode === 'annual') {
          const snap = await getAnnualSnapshot()
          setData(deriveAnnual(snap))
        } else {
          const snap = await getDashboardSnapshot(selectedMes)
          setData(deriveMonthly(snap, selectedMes))
        }
      } catch (e) {
        console.error('[dashboard] failed to load snapshot', e)
        setError('No se pudieron cargar los datos. Reintentá en unos segundos.')
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void fetchData(viewMode, mes)
  }, [viewMode, mes, fetchData])

  const refetch = useCallback(() => {
    void fetchData(viewMode, mes)
  }, [fetchData, viewMode, mes])

  // Filter helpers shared across monthly + annual views.
  const allTiposSelected = tipoFilter.length === TIPO_OPTIONS.length
  const passesFilters = useCallback(
    (p: Proyecto) => {
      if (!allTiposSelected) {
        // When the user has unchecked some tipos, only show projects whose
        // tipo is in the selected set. Projects without a tipo never pass
        // a partial filter (you can't filter by "nothing").
        if (!p.tipo || !tipoFilter.includes(p.tipo)) return false
      }
      if (!matchesQuery(p.nombre, searchQuery)) return false
      return true
    },
    [tipoFilter, allTiposSelected, searchQuery]
  )

  // Show every project (including newly-created ones with no BPs / no
  // hours yet) so they're discoverable from the dashboard. Active ones
  // float to the top by margin; the rest fall to the bottom alphabetical.
  const monthlyActive = useMemo(() => {
    if (!data || data.mode !== 'monthly') return []
    return data.projectSummaries
      .filter((s) => passesFilters(s.proyecto))
      .sort((a, b) => {
        if (a.bps > 0 && b.bps === 0) return -1
        if (a.bps === 0 && b.bps > 0) return 1
        if (a.bps > 0 && b.bps > 0) return b.marginPercent - a.marginPercent
        return a.proyecto.nombre.localeCompare(b.proyecto.nombre)
      })
  }, [data, passesFilters])

  const annualActive = useMemo(() => {
    if (!data || data.mode !== 'annual') return []
    return data.projects
      .filter((s) => passesFilters(s.proyecto))
      .sort((a, b) => {
        if (a.totalHoras > 0 && b.totalHoras === 0) return -1
        if (a.totalHoras === 0 && b.totalHoras > 0) return 1
        if (a.totalHoras > 0 && b.totalHoras > 0)
          return b.marginPercent - a.marginPercent
        return a.proyecto.nombre.localeCompare(b.proyecto.nombre)
      })
  }, [data, passesFilters])

  const topbarActions = (
    <div className="flex items-center gap-2">
      <ViewToggle value={viewMode} onChange={setViewMode} />
      {viewMode === 'monthly' && (
        <MonthPicker value={mes} onChange={setMes} />
      )}
      <MultiSelect
        ariaLabel="Filtrar por tipo"
        value={tipoFilter}
        onChange={setTipoFilter}
        options={TIPO_OPTIONS.map((t) => ({ value: t, label: t }))}
        allLabel="Todos los tipos"
        allOptionLabel="Todas"
        placeholder="Sin tipos"
      />
    </div>
  )

  return (
    <AppLayout
      breadcrumb={[
        { label: 'Dashboards' },
        { label: 'Proyectos', active: true },
      ]}
      topbarActions={topbarActions}
    >
      <PageHeader
        title="Rentabilidad de proyectos"
        subtitle={
          viewMode === 'monthly'
            ? `Vista mensual · ${getMonthLabel(mes)} ${CURRENT_YEAR}`
            : `Vista anual · ${CURRENT_YEAR}`
        }
        action={
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Nuevo proyecto
          </Button>
        }
      />

      <NewProjectDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={refetch}
      />
      <EditProjectDialog
        open={editingProyecto !== null}
        onOpenChange={(o) => !o && setEditingProyecto(null)}
        proyecto={editingProyecto}
        onSaved={refetch}
      />
      <ProjectDetailModal
        open={detailingProyecto !== null}
        onOpenChange={(o) => !o && setDetailingProyecto(null)}
        proyecto={detailingProyecto}
        mes={mes}
        onEdit={(p) => {
          setDetailingProyecto(null)
          setEditingProyecto(p)
        }}
      />
      <ProjectHonorarioFullYearModal
        open={honorariosProyecto !== null}
        onOpenChange={(o) => !o && setHonorariosProyecto(null)}
        proyecto={honorariosProyecto}
        onSaved={refetch}
      />
      <ConfirmDialog
        open={deletingProyecto !== null}
        onOpenChange={(o) => !o && setDeletingProyecto(null)}
        title="Eliminar proyecto"
        description={
          deletingProyecto ? (
            <>
              ¿Estás seguro? Esta acción borra{' '}
              <strong>{deletingProyecto.nombre}</strong> y sus dependencias
              (asignaciones, honorarios mensuales). No se puede deshacer.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!deletingProyecto) return
          const result = await deleteProyecto(deletingProyecto.id)
          if (result.success) {
            toast.success('Proyecto eliminado')
            setDeletingProyecto(null)
            refetch()
          } else {
            toast.error('No se pudo eliminar', { description: result.error })
          }
        }}
      />

      {error && <ErrorBanner message={error} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {loading || !data ? (
          <KpiSkeletonGrid count={5} />
        ) : data.mode === 'monthly' ? (
          <>
            <KpiCard
              label="Ingresos del mes"
              value={formatCompactCurrency(data.revenue)}
              fullValue={formatCurrency(data.revenue)}
              meta={`${monthlyActive.length} proyectos activos`}
            />
            <KpiCard
              label="Costo de BPs"
              value={formatCompactCurrency(data.costs)}
              fullValue={formatCurrency(data.costs)}
              meta={`${data.snapshot.brandPartners.length} BPs en plantilla`}
            />
            <RentabilidadKpi data={data.rentabilidad} scope="mes" />
            <KpiCard
              label="Margen bruto"
              value={formatPercent(data.marginPercent)}
              meta={
                data.revenue > 0
                  ? `${formatCompactCurrency(data.revenue - data.costs)} netos`
                  : 'sin datos'
              }
            />
            <KpiCard
              label="Horas idle"
              value={formatCompactHours(data.idleHours)}
              fullValue={formatHours(data.idleHours)}
              meta={`sobre ${formatCompactHours(data.snapshot.brandPartners.length * HOURS_PER_MONTH)} disponibles`}
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Ingresos del año"
              value={formatCompactCurrency(data.kpis.revenue)}
              fullValue={formatCurrency(data.kpis.revenue)}
              meta={`${data.kpis.activeProjects} proyectos con horas`}
            />
            <KpiCard
              label="Costo de BPs (año)"
              value={formatCompactCurrency(data.kpis.costs)}
              fullValue={formatCurrency(data.kpis.costs)}
              meta={`${data.snapshot.brandPartners.length} BPs en plantilla`}
            />
            <RentabilidadKpi data={data.rentabilidad} scope="año" />
            <KpiCard
              label="Margen anual"
              value={formatPercent(data.kpis.marginPercent)}
              meta={
                data.kpis.revenue > 0
                  ? `${formatCompactCurrency(data.kpis.revenue - data.kpis.costs)} netos`
                  : 'sin datos'
              }
            />
            <KpiCard
              label="Horas idle (año)"
              value={formatCompactHours(data.kpis.idleHours)}
              fullValue={formatHours(data.kpis.idleHours)}
              meta="suma de 12 meses"
            />
          </>
        )}
      </div>

      {/* Chart + Top BPs (only in monthly mode; annual shows the wide table) */}
      {data?.mode !== 'annual' && (
        <div className="grid grid-cols-3 gap-5 mb-5">
          <div className="col-span-2">
            <Section title="Margen por proyecto" flush>
              <ChartCard height={240} glow={false}>
                {loading || !data ? (
                  <Skeleton className="w-full h-full rounded" />
                ) : monthlyActive.length === 0 ? (
                  <EmptyState message="Sin asignaciones en este mes." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyActive.map((s) => ({
                        name: shortName(s.proyecto.nombre),
                        margin: round1(s.marginPercent),
                      }))}
                      margin={{ top: 12, right: 12, left: -12, bottom: 4 }}
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
                      />
                      <YAxis
                        stroke="var(--text-tertiary)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        cursor={{ fill: 'var(--bg-hover)' }}
                        formatter={(v: number) => [`${formatNumber(v, 1)}%`, 'Margen']}
                      />
                      <Bar dataKey="margin" radius={[4, 4, 0, 0]} maxBarSize={36}>
                        {monthlyActive.map((s, i) => (
                          <Cell
                            key={i}
                            fill={
                              s.marginPercent > 20
                                ? 'var(--success)'
                                : s.marginPercent > 0
                                  ? 'var(--warning)'
                                  : 'var(--danger)'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </Section>
          </div>

          <Section title="Top BPs por rentabilidad" flush>
            {loading || !data ? (
              <ListSkeleton rows={4} />
            ) : (
              <TopBpsList summaries={monthlyActive} />
            )}
          </Section>
        </div>
      )}

      {/* Projects table */}
      <Section
        title="Proyectos activos"
        tabs={
          loading || !data
            ? undefined
            : data.mode === 'monthly'
              ? [
                  { label: `Todos · ${monthlyActive.length}`, active: true },
                  {
                    label: `Rentables · ${
                      monthlyActive.filter((s) => s.marginPercent > 20).length
                    }`,
                  },
                  {
                    label: `En riesgo · ${
                      monthlyActive.filter((s) => s.marginPercent <= 0).length
                    }`,
                  },
                ]
              : [{ label: `Todos · ${annualActive.length}`, active: true }]
        }
        flush
      >
        {loading || !data ? (
          <TableSkeleton />
        ) : data.mode === 'monthly' ? (
          monthlyActive.length === 0 ? (
            <EmptyState
              message={
                searchQuery || !allTiposSelected
                  ? 'Ningún proyecto coincide con los filtros.'
                  : 'Sin asignaciones en este mes.'
              }
            />
          ) : (
            <DataTable
              columns={monthlyColumns(setEditingProyecto, setDeletingProyecto)}
              data={monthlyActive}
              rowKey={(r) => String(r.proyecto.id)}
              onRowClick={(r) => setDetailingProyecto(r.proyecto)}
            />
          )
        ) : annualActive.length === 0 ? (
          <EmptyState
            message={
              searchQuery || !allTiposSelected
                ? 'Ningún proyecto coincide con los filtros.'
                : 'Sin asignaciones cargadas.'
            }
          />
        ) : (
          <DataTable
            columns={annualColumns(
              setEditingProyecto,
              setDeletingProyecto,
              setHonorariosProyecto
            )}
            data={annualActive}
            rowKey={(r) => String(r.proyecto.id)}
            // Same as monthly: clicking the row opens the rich detail
            // modal (KPIs + BP distribution). The bulk-honorarios editor
            // moved to a dedicated icon in the actions column.
            onRowClick={(r) => setDetailingProyecto(r.proyecto)}
          />
        )}
      </Section>
    </AppLayout>
  )
}

// --------------------------------------------------------------------------
// Columns
// --------------------------------------------------------------------------

function RowActions({
  onEdit,
  onDelete,
  onHonorarios,
}: {
  onEdit: () => void
  onDelete: () => void
  /** Optional bulk-honorarios trigger — shown only when provided. */
  onHonorarios?: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {onHonorarios && (
        <button
          type="button"
          aria-label="Editar honorarios anuales"
          title="Editar honorarios anuales"
          onClick={(e) => {
            e.stopPropagation()
            onHonorarios()
          }}
          className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-accent hover:bg-accent-soft transition-colors"
        >
          <Coins className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label="Editar"
        title="Editar"
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-primary hover:bg-hover transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        aria-label="Eliminar"
        title="Eliminar"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function monthlyColumns(
  onEdit: (p: Proyecto) => void,
  onDelete: (p: Proyecto) => void
): DataTableColumn<ProjectMonthSummary>[] {
  return [
    {
      key: 'proyecto',
      accessor: 'proyecto',
      header: 'Proyecto',
      render: (_v, row) => (
        <span className="font-medium">{row.proyecto.nombre}</span>
      ),
    },
    {
      key: 'bps',
      accessor: 'bps',
      header: 'BPs',
      render: (v) => v as number,
    },
    {
      key: 'utilization',
      accessor: 'utilization',
      header: 'Utilización',
      render: (v) => <UtilizationBar value={Math.round(v as number)} />,
    },
    {
      key: 'projectRate',
      accessor: 'projectRate',
      header: '$/h proyecto',
      numeric: true,
      render: (v) => formatCurrency(v as number, 2),
    },
    {
      key: 'avgBpRate',
      accessor: 'avgBpRate',
      header: '$/h BP prom.',
      numeric: true,
      render: (v) =>
        (v as number) > 0 ? formatCurrency(v as number, 2) : '—',
    },
    {
      key: 'marginPercent',
      accessor: 'marginPercent',
      header: 'Margen',
      numeric: true,
      render: (v) => <MarginCell value={v as number} />,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (_v, row) => {
        const { variant, label } = statusVariantFor(row.proyecto.status)
        return <StatusBadge variant={variant} label={label} />
      },
    },
    {
      key: 'acciones',
      header: '',
      render: (_v, row) => (
        <RowActions
          onEdit={() => onEdit(row.proyecto)}
          onDelete={() => onDelete(row.proyecto)}
        />
      ),
    },
  ]
}

function annualColumns(
  onEdit: (p: Proyecto) => void,
  onDelete: (p: Proyecto) => void,
  onHonorarios: (p: Proyecto) => void
): DataTableColumn<ProjectAnnualSummary>[] {
  const monthCols: DataTableColumn<ProjectAnnualSummary>[] = MONTHS.map((m) => ({
    key: `mes-${m}`,
    header: getMonthLabel(m).slice(0, 3),
    align: 'right',
    render: (_v, row) => {
      const data = row.byMonth[m - 1]
      if (!data || data.bps === 0) return <span className="text-tertiary">—</span>
      return <MarginCell value={data.marginPercent} compact />
    },
  }))
  return [
    {
      key: 'proyecto',
      accessor: 'proyecto',
      header: 'Proyecto',
      render: (_v, row) => (
        <span className="font-medium whitespace-nowrap">{row.proyecto.nombre}</span>
      ),
    },
    {
      key: 'marginPercent',
      accessor: 'marginPercent',
      header: 'Anual',
      numeric: true,
      render: (v) => <MarginCell value={v as number} />,
    },
    ...monthCols,
    {
      key: 'acciones',
      header: '',
      render: (_v, row) => (
        <RowActions
          onEdit={() => onEdit(row.proyecto)}
          onDelete={() => onDelete(row.proyecto)}
          onHonorarios={() => onHonorarios(row.proyecto)}
        />
      ),
    },
  ]
}

function MarginCell({ value, compact }: { value: number; compact?: boolean }) {
  const color =
    value > 20
      ? 'var(--success)'
      : value > 0
        ? 'var(--warning)'
        : 'var(--danger)'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return (
    <span style={{ color }} className={compact ? 'text-2xs' : undefined}>
      {sign}
      {formatNumber(Math.abs(value), 1)}%
    </span>
  )
}

function TopBpsList({ summaries }: { summaries: ProjectMonthSummary[] }) {
  const top = summaries.slice(0, 4)
  if (top.length === 0) {
    return <EmptyState message="Sin datos para este mes." />
  }
  return (
    <ul>
      {top.map((s) => (
        <li
          key={String(s.proyecto.id)}
          className="flex items-center justify-between px-5 py-3 border-b border-border last:border-0"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium truncate">{s.proyecto.nombre}</span>
            <span className="text-2xs text-tertiary truncate">
              {s.bps} BPs · {formatHours(Math.round(s.totalHoras))}
            </span>
          </div>
          <span
            className="font-mono text-sm font-medium tabular-nums whitespace-nowrap pl-2"
            style={{
              color: s.marginAbsolute >= 0 ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {s.marginAbsolute >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(s.marginAbsolute))}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RentabilidadKpi({
  data,
  scope,
}: {
  data: AggregatedRentabilidad
  scope: 'mes' | 'año'
}) {
  const positive = data.total > 0
  const negative = data.total < 0
  const sign = positive ? '+' : negative ? '−' : ''
  const display = `${sign}${formatCompactCurrency(Math.abs(data.total))}`
  const fullValue = `${sign}${formatCurrency(Math.abs(data.total))}`
  const color =
    data.totalHoras === 0
      ? undefined
      : positive
        ? 'var(--success)'
        : negative
          ? 'var(--danger)'
          : undefined
  const label = scope === 'año' ? 'Rentabilidad anual' : 'Rentabilidad del mes'
  const meta =
    data.totalHoras === 0
      ? 'sin datos'
      : `${data.rentables} rentables · ${data.noRentables} pierden`
  return (
    <KpiCard
      label={label}
      fullValue={fullValue}
      value={
        color ? (
          <span style={{ color }}>{display}</span>
        ) : (
          display
        )
      }
      meta={meta}
    />
  )
}

function shortName(s: string, limit = 18): string {
  if (s.length <= limit) return s
  return s.slice(0, limit - 1) + '…'
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
