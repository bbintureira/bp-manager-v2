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
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle'
import {
  formatCompactCurrency,
  formatCurrency,
  formatHours,
  formatNumber,
  formatPercent,
} from '@/lib/format'
import {
  calculateBPCosts,
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
import { exportProyectos, type ProyectoExportRow } from '@/utils/exportToExcel'
import { importProyectos } from '@/utils/importFromExcel'
import { ExportButton } from '@/components/ui/export-button'
import { UploadButton } from '@/components/ui/upload-button'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { TOOLTIPS } from '@/constants/tooltips'

// --------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear()
const defaultMonth = () => new Date().getMonth() + 1

const withInfo = (text: string, tip: string) => (
  <span className="inline-flex items-center gap-1">
    {text}
    <InfoTooltip text={tip} />
  </span>
)

function statusVariantFor(raw: string | null | undefined): {
  variant: StatusVariant
  label: string
} {
  const v = (raw ?? '').toLowerCase().trim()
  if (
    [
      'finalizado',
      'finished',
      'closed',
      'cerrado',
      'completed',
      'done',
    ].includes(v)
  ) {
    return { variant: 'neutral', label: 'Finalizado' }
  }
  // Everything else — including legacy 'ok', empty, or any unknown
  // string — collapses to Activo. There are only two real states now
  // (Activo / Finalizado); old rows that wrote 'OK' get rendered as
  // Activo instead of leaking the raw label.
  return { variant: 'active', label: 'Activo' }
}

interface MonthlyData {
  mode: 'monthly'
  snapshot: DashboardSnapshot
  revenue: number
  costs: number
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
    marginPercent: calculateMargin(revenue, costs),
    projectSummaries: summarizeAllProjects(
      snapshot.proyectos,
      snapshot.asignaciones,
      snapshot.sueldos,
      mes,
      snapshot.brandPartners,
      snapshot.honorariosMensuales,
      snapshot.horasMensuales
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
      snapshot.honorariosMensuales,
      snapshot.horasMensuales
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
          // Debug aid: surface what the fresh snapshot actually carries
          // for the first project (mes 1..12 honorarios + horas). Helps
          // diagnose stale-UI complaints without round-trips through me.
          if (snap.proyectos[0]) {
            const p = snap.proyectos[0]
            const hon = snap.honorariosMensuales
              .filter((h) => String(h.proyecto_id) === String(p.id))
              .sort((a, b) => a.mes - b.mes)
            const horas = snap.horasMensuales
              .filter((h) => String(h.proyecto_id) === String(p.id))
              .sort((a, b) => a.mes - b.mes)
            console.log('[dashboard] annual snapshot for', p.nombre, {
              honorarios: hon.map((r) => r.honorarios),
              horas: horas.map((r) => r.horas),
            })
          }
          setData(deriveAnnual(snap))
        } else {
          const snap = await getDashboardSnapshot(selectedMes)
          if (snap.proyectos[0]) {
            const p = snap.proyectos[0]
            const hon = snap.honorariosMensuales
              .filter((h) => String(h.proyecto_id) === String(p.id))
              .sort((a, b) => a.mes - b.mes)
            const horas = snap.horasMensuales
              .filter((h) => String(h.proyecto_id) === String(p.id))
              .sort((a, b) => a.mes - b.mes)
            console.log('[dashboard] monthly snapshot for', p.nombre, {
              mes: selectedMes,
              honorarios: hon.map((r) => r.honorarios),
              horas: horas.map((r) => r.horas),
            })
          }
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

  const refetch = useCallback(
    () => fetchData(viewMode, mes),
    [fetchData, viewMode, mes]
  )

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

  // Monthly view only surfaces projects that have actual data for this
  // mes: either asignaciones (totalHoras > 0) or booked honorarios
  // (revenue > 0). Empty / future projects are hidden so the table
  // mirrors what's actually moving that month.
  const monthlyActive = useMemo(() => {
    if (!data || data.mode !== 'monthly') return []
    return data.projectSummaries
      .filter((s) => passesFilters(s.proyecto))
      .filter((s) => s.totalHoras > 0 || s.revenue > 0)
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
          <div className="flex items-center gap-2">
            <ExportButton
              label="Descargar Excel"
              onExport={async () => {
                // Always pull fresh data — page state may be stale (the
                // user could have edited in another tab or another user
                // just upserted).
                const snap = await getAnnualSnapshot()
                const honByKey = new Map<string, number>()
                for (const h of snap.honorariosMensuales ?? []) {
                  honByKey.set(
                    `${String(h.proyecto_id)}::${Number(h.mes)}`,
                    Number(h.honorarios) || 0
                  )
                }
                const horasByKey = new Map<string, number>()
                for (const h of snap.horasMensuales ?? []) {
                  horasByKey.set(
                    `${String(h.proyecto_id)}::${Number(h.mes)}`,
                    Number(h.horas) || 0
                  )
                }
                const rows: ProyectoExportRow[] = snap.proyectos.map((p) => {
                  // Per-month grid is authoritative when it exists:
                  // `0` is a legitimate stored value (e.g. a month the
                  // project doesn't bill / staff). Only fall back to the
                  // scalar when there's no row at all for the (project,
                  // mes) pair, so projects that haven't been touched
                  // since the per-month table was introduced still show
                  // something.
                  const honoScalar =
                    Number(
                      p.precio_mensual ?? p.honorarios_cotizador ?? 0
                    ) || 0
                  const horasScalar =
                    Number(p.horas_requeridas_mensual ?? 0) || 0
                  const honorariosPorMes: number[] = []
                  const horasPorMes: number[] = []
                  for (let m = 1; m <= 12; m++) {
                    const honKey = `${String(p.id)}::${m}`
                    const horKey = `${String(p.id)}::${m}`
                    honorariosPorMes.push(
                      honByKey.has(honKey)
                        ? honByKey.get(honKey) ?? 0
                        : honoScalar
                    )
                    horasPorMes.push(
                      horasByKey.has(horKey)
                        ? horasByKey.get(horKey) ?? 0
                        : horasScalar
                    )
                  }
                  return { proyecto: p, honorariosPorMes, horasPorMes }
                })
                exportProyectos(rows)
              }}
            />
            <UploadButton
              label="Subir Excel"
              onFile={importProyectos}
              onComplete={refetch}
              disabled={loading}
            />
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              Nuevo proyecto
            </Button>
          </div>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {loading || !data ? (
          <KpiSkeletonGrid count={4} />
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
            <RentabilidadKpi
              total={data.revenue - data.costs}
              data={data.rentabilidad}
              scope="mes"
            />
            <KpiCard
              label={withInfo('Margen bruto', TOOLTIPS.margenBruto)}
              value={formatPercent(data.marginPercent)}
              meta={
                data.revenue > 0
                  ? `${formatCompactCurrency(data.revenue - data.costs)} netos`
                  : 'sin datos'
              }
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
            <RentabilidadKpi
              total={data.kpis.revenue - data.kpis.costs}
              data={data.rentabilidad}
              scope="año"
            />
            <KpiCard
              label={withInfo('Margen anual', TOOLTIPS.margenAnual)}
              value={formatPercent(data.kpis.marginPercent)}
              meta={
                data.kpis.revenue > 0
                  ? `${formatCompactCurrency(data.kpis.revenue - data.kpis.costs)} netos`
                  : 'sin datos'
              }
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
                  : 'No hay datos para este mes.'
              }
            />
          ) : (
            <DataTable
              columns={projectTableColumns<ProjectMonthSummary>(
                setEditingProyecto,
                setDeletingProyecto
              )}
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
            columns={projectTableColumns<ProjectAnnualSummary>(
              setEditingProyecto,
              setDeletingProyecto,
              setHonorariosProyecto,
              TOOLTIPS.ingresosColumnaAnual
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

/** Shared shape between monthly + annual project summaries — both
 *  expose the fields the simplified table needs. */
interface ProjectRowLike {
  proyecto: Proyecto
  revenue: number
  cost: number
  marginAbsolute: number
}

function projectTableColumns<T extends ProjectRowLike>(
  onEdit: (p: Proyecto) => void,
  onDelete: (p: Proyecto) => void,
  onHonorarios?: (p: Proyecto) => void,
  ingresosTooltipText?: string
): DataTableColumn<T>[] {
  return [
    {
      key: 'proyecto',
      header: 'Proyecto',
      render: (_v, row) => (
        <span className="font-medium whitespace-nowrap">
          {row.proyecto.nombre}
        </span>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      render: (_v, row) => (
        <span className="text-secondary whitespace-nowrap">
          {row.proyecto.tipo ?? '—'}
        </span>
      ),
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
      key: 'ingresos',
      header: ingresosTooltipText
        ? withInfo('Ingresos', ingresosTooltipText)
        : 'Ingresos',
      numeric: true,
      render: (_v, row) => formatCurrency(row.revenue, 0),
    },
    {
      key: 'costo',
      header: withInfo('Costo', TOOLTIPS.costoColumna),
      numeric: true,
      render: (_v, row) => formatCurrency(row.cost, 0),
    },
    {
      key: 'resultado',
      header: withInfo('Resultado', TOOLTIPS.resultadoColumna),
      numeric: true,
      render: (_v, row) => <ResultCell value={row.marginAbsolute} />,
    },
    {
      key: 'acciones',
      header: '',
      render: (_v, row) => (
        <RowActions
          onEdit={() => onEdit(row.proyecto)}
          onDelete={() => onDelete(row.proyecto)}
          onHonorarios={
            onHonorarios ? () => onHonorarios(row.proyecto) : undefined
          }
        />
      ),
    },
  ]
}

/** Green / red signed currency for Resultado = Ingresos − Costo. */
function ResultCell({ value }: { value: number }) {
  const color =
    value > 0
      ? 'var(--success)'
      : value < 0
        ? 'var(--danger)'
        : 'var(--text-secondary)'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return (
    <span style={{ color }} className="font-mono font-medium">
      {sign}
      {formatCurrency(Math.abs(value), 0).replace(/^[+-]?/, '')}
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
  total,
  data,
  scope,
}: {
  /** Displayed amount = Ingresos − Costo. Single source of truth shared
   *  with the "Margen" KPI subtitle. */
  total: number
  /** Per-project breakdown — used only for the meta line (rentables /
   *  pierden) and to detect the "no data" state. */
  data: AggregatedRentabilidad
  scope: 'mes' | 'año'
}) {
  const positive = total > 0
  const negative = total < 0
  const sign = positive ? '+' : negative ? '−' : ''
  const display = `${sign}${formatCompactCurrency(Math.abs(total))}`
  const fullValue = `${sign}${formatCurrency(Math.abs(total))}`
  const color =
    data.totalHoras === 0
      ? undefined
      : positive
        ? 'var(--success)'
        : negative
          ? 'var(--danger)'
          : undefined
  const label =
    scope === 'año'
      ? withInfo('Rentabilidad anual', TOOLTIPS.rentabilidadAnual)
      : withInfo('Rentabilidad del mes', TOOLTIPS.rentabilidadMes)
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
