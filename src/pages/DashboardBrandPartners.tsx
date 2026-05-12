import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader } from '@/components/layout/page-header'
import { NewBPDialog } from '@/components/dialogs/NewBPDialog'
import { EditBPDialog } from '@/components/dialogs/EditBPDialog'
import { BPDetailModal } from '@/components/dialogs/BPDetailModal'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { GroupersManagerDialog } from '@/components/dialogs/GroupersManagerDialog'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { KpiCard } from '@/components/ui/kpi-card'
import {
  EmptyState,
  ErrorBanner,
  KpiSkeletonGrid,
  TableSkeleton,
} from '@/components/ui/loading-states'
import { MonthPicker, getMonthLabel } from '@/components/ui/month-picker'
import { Section } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
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
  bpHorasAnnualAggregate,
  bpHorasMonthRow,
  bpRentabilidadAnnualAggregate,
  bpRentabilidadMonthRow,
  getMesIngreso,
  type BPHorasAnnualAggregate,
  type BPHorasMonthRow,
  type BPRentabilidadAnnualAggregate,
  type BPRentabilidadMonthRow,
} from '@/lib/calculations'
import {
  deleteBrandPartner,
  getAnnualSnapshot,
  getDashboardSnapshot,
  getGroupers,
  type AnnualSnapshot,
  type BrandPartner,
  type DashboardSnapshot,
  type Grouper,
} from '@/lib/queries'
import { matchesQuery, useSearch } from '@/hooks/useSearch'
import { displaySeniority } from '@/lib/seniority'
import { cn } from '@/lib/utils'

const CURRENT_YEAR = new Date().getFullYear()
const defaultMonth = () => new Date().getMonth() + 1
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

type TabKey = 'horas' | 'rentabilidad'

export function DashboardBrandPartners() {
  const [tab, setTab] = useState<TabKey>('horas')
  const [view, setView] = useState<ViewMode>('monthly')
  const [mes, setMes] = useState<number>(defaultMonth)
  const [snapshot, setSnapshot] = useState<
    DashboardSnapshot | AnnualSnapshot | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<BrandPartner | null>(null)
  const [detailing, setDetailing] = useState<BrandPartner | null>(null)
  const [deleting, setDeleting] = useState<BrandPartner | null>(null)

  const [grouperFilter, setGrouperFilter] = useState<string>('')
  const [activoFilter, setActivoFilter] = useState<'activos' | 'inactivos' | 'todos'>(
    'activos'
  )
  const [groupersOpen, setGroupersOpen] = useState(false)
  const [canonicalGroupers, setCanonicalGroupers] = useState<Grouper[]>([])

  const loadGroupers = useCallback(async () => {
    const rows = await getGroupers()
    setCanonicalGroupers(rows)
  }, [])

  useEffect(() => {
    void loadGroupers()
  }, [loadGroupers])

  const { query: searchQuery } = useSearch()

  const fetchData = useCallback(
    async (mode: ViewMode, selectedMes: number) => {
      setLoading(true)
      setError(null)
      try {
        const snap =
          mode === 'annual'
            ? await getAnnualSnapshot()
            : await getDashboardSnapshot(selectedMes)
        setSnapshot(snap)
      } catch (e) {
        console.error('[bp-dashboard] failed', e)
        setError('No se pudieron cargar los datos.')
        setSnapshot(null)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void fetchData(view, mes)
  }, [view, mes, fetchData])

  const refetch = useCallback(() => {
    void fetchData(view, mes)
  }, [fetchData, view, mes])

  const filterableGroupers = useMemo(
    () => [...canonicalGroupers].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [canonicalGroupers]
  )

  // Build per-tab rows once. Both tabs filter on the same set of BPs but
  // each tab needs different per-BP fields, so we compute both arrays.
  const allHorasRows: BPHorasMonthRow[] = useMemo(() => {
    if (!snapshot || view !== 'monthly') return []
    return snapshot.brandPartners.map((bp) =>
      bpHorasMonthRow(bp, snapshot.asignaciones, snapshot.proyectos, mes)
    )
  }, [snapshot, mes, view])

  const allRentabilidadRows: BPRentabilidadMonthRow[] = useMemo(() => {
    if (!snapshot || view !== 'monthly') return []
    return snapshot.brandPartners.map((bp) =>
      bpRentabilidadMonthRow(
        bp,
        snapshot.asignaciones,
        snapshot.sueldos,
        snapshot.proyectos,
        snapshot.honorariosMensuales,
        mes
      )
    )
  }, [snapshot, mes, view])

  const allHorasAnnual: BPHorasAnnualAggregate[] = useMemo(() => {
    if (!snapshot || view !== 'annual') return []
    return snapshot.brandPartners.map((bp) =>
      bpHorasAnnualAggregate(bp, snapshot.asignaciones, snapshot.proyectos)
    )
  }, [snapshot, view])

  const allRentabilidadAnnual: BPRentabilidadAnnualAggregate[] = useMemo(() => {
    if (!snapshot || view !== 'annual') return []
    return snapshot.brandPartners.map((bp) =>
      bpRentabilidadAnnualAggregate(
        bp,
        snapshot.asignaciones,
        snapshot.sueldos,
        snapshot.proyectos,
        snapshot.honorariosMensuales
      )
    )
  }, [snapshot, view])

  function bpPasses(bp: BrandPartner): boolean {
    if (!matchesQuery(bp.nombre, searchQuery)) return false
    if (grouperFilter && (bp.grouper_id ?? '') !== grouperFilter) return false
    const isActive = bp.activo !== false
    if (activoFilter === 'activos' && !isActive) return false
    if (activoFilter === 'inactivos' && isActive) return false
    return true
  }

  const filteredHoras = useMemo(
    () => allHorasRows.filter((r) => bpPasses(r.bp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allHorasRows, searchQuery, grouperFilter, activoFilter]
  )
  const filteredRentabilidad = useMemo(
    () => allRentabilidadRows.filter((r) => bpPasses(r.bp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRentabilidadRows, searchQuery, grouperFilter, activoFilter]
  )
  const filteredHorasAnnual = useMemo(
    () => allHorasAnnual.filter((r) => bpPasses(r.bp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allHorasAnnual, searchQuery, grouperFilter, activoFilter]
  )
  const filteredRentabilidadAnnual = useMemo(
    () => allRentabilidadAnnual.filter((r) => bpPasses(r.bp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRentabilidadAnnual, searchQuery, grouperFilter, activoFilter]
  )

  // KPIs are tab-independent: the page-level cards always describe team
  // utilization (BPs activos / % ocupación / horas libres). The
  // Rentabilidad-specific metrics live inside the per-BP rows + detail
  // modal, not at the global page header.
  const kpiStats = useMemo(() => {
    const monthly = view === 'monthly'
    const rows = monthly ? filteredHoras : filteredHorasAnnual
    // Active count is computed from the filtered set so it respects
    // grouper/search filters but ignores the activos/inactivos toggle:
    // "Total BPs activos" should always count actives, regardless of
    // whether the user is currently viewing the inactive list.
    const activos = rows.filter((r) => r.bp.activo !== false).length

    if (monthly) {
      const totalContratadas = filteredHoras.reduce(
        (s, r) => s + r.horasContratadas,
        0
      )
      const totalAsignadas = filteredHoras.reduce(
        (s, r) => s + r.horasAsignadas,
        0
      )
      const totalLibres = filteredHoras.reduce((s, r) => s + r.horasLibres, 0)
      const ocupacion =
        totalContratadas > 0 ? (totalAsignadas / totalContratadas) * 100 : 0
      return { kind: 'mes' as const, activos, ocupacion, totalLibres }
    }
    const totalContratadas = filteredHorasAnnual.reduce(
      (s, r) => s + r.totalContratadas,
      0
    )
    const totalAsignadas = filteredHorasAnnual.reduce(
      (s, r) => s + r.totalAsignadas,
      0
    )
    const totalLibres = filteredHorasAnnual.reduce(
      (s, r) => s + r.totalLibres,
      0
    )
    const ocupacion =
      totalContratadas > 0 ? (totalAsignadas / totalContratadas) * 100 : 0
    // Year has 12 months — fixed denominator so the metric is comparable
    // across teams of different sizes.
    const libresPromedioMes = totalLibres / 12
    return { kind: 'año' as const, activos, ocupacion, libresPromedioMes }
  }, [view, filteredHoras, filteredHorasAnnual])

  const topbarActions = (
    <div className="flex items-center gap-2">
      <ViewToggle value={view} onChange={setView} />
      {view === 'monthly' && <MonthPicker value={mes} onChange={setMes} />}
      <Select
        aria-label="Filtrar por estado"
        value={activoFilter}
        onChange={(e) =>
          setActivoFilter(e.target.value as 'activos' | 'inactivos' | 'todos')
        }
        className="w-auto pr-8"
      >
        <option value="activos">Activos</option>
        <option value="inactivos">No activos</option>
        <option value="todos">Todos</option>
      </Select>
      <Select
        aria-label="Filtrar por grouper"
        value={grouperFilter}
        onChange={(e) => setGrouperFilter(e.target.value)}
        className="w-auto pr-8 max-w-[200px]"
      >
        <option value="">Todos los groupers</option>
        {filterableGroupers.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nombre}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setGroupersOpen(true)}
        title="Gestionar lista de groupers"
      >
        <Settings2 className="w-3.5 h-3.5" />
        Groupers
      </Button>
    </div>
  )

  const filteredCount =
    view === 'monthly'
      ? tab === 'horas'
        ? filteredHoras.length
        : filteredRentabilidad.length
      : tab === 'horas'
        ? filteredHorasAnnual.length
        : filteredRentabilidadAnnual.length

  // Annual mode: only render month columns that have at least one
  // asignacion among the currently-visible BPs. Use the horas annual
  // aggregate as the source of truth (horasAsignadas > 0 ⇔ has asignacion).
  const activeMonths = useMemo(() => {
    if (view !== 'annual') return MONTHS
    // We need the union from BOTH annual aggregates' BP set; but they
    // share the same BPs (filtered identically), so horas suffices.
    const months = new Set<number>()
    for (const row of filteredHorasAnnual) {
      row.byMonth.forEach((h, i) => {
        if (h > 0) months.add(i + 1)
      })
    }
    return MONTHS.filter((m) => months.has(m))
  }, [view, filteredHorasAnnual])

  return (
    <AppLayout
      breadcrumb={[
        { label: 'Dashboards' },
        { label: 'Brand Partners', active: true },
      ]}
      topbarActions={topbarActions}
    >
      <PageHeader
        title="Brand Partners"
        subtitle={`${
          view === 'monthly' ? `${getMonthLabel(mes)} ${CURRENT_YEAR}` : `Año ${CURRENT_YEAR}`
        } · ${tab === 'horas' ? 'Utilización de horas' : 'Rentabilidad en pesos'}`}
        action={
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Nuevo BP
          </Button>
        }
      />

      <NewBPDialog
        open={openNew}
        onOpenChange={setOpenNew}
        existingGroupers={canonicalGroupers}
        onCreated={refetch}
      />
      <EditBPDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        bp={editing}
        existingGroupers={canonicalGroupers}
        onSaved={refetch}
      />
      <GroupersManagerDialog
        open={groupersOpen}
        onOpenChange={setGroupersOpen}
        onChanged={loadGroupers}
      />
      <BPDetailModal
        open={detailing !== null}
        onOpenChange={(o) => !o && setDetailing(null)}
        bp={detailing}
        activeTab={tab}
        mes={mes}
        onEdit={(bp) => {
          setDetailing(null)
          setEditing(bp)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminar Brand Partner"
        description={
          deleting ? (
            <>
              ¿Estás seguro? Esta acción borra <strong>{deleting.nombre}</strong>{' '}
              y sus dependencias (asignaciones, sueldos). No se puede deshacer.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          const result = await deleteBrandPartner(deleting.id)
          if (result.success) {
            toast.success('BP eliminado')
            setDeleting(null)
            refetch()
          } else {
            toast.error('No se pudo eliminar', { description: result.error })
          }
        }}
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {loading || !snapshot ? (
          <KpiSkeletonGrid count={3} />
        ) : kpiStats.kind === 'mes' ? (
          <>
            <KpiCard
              label="Total BPs activos"
              value={formatNumber(kpiStats.activos, 0)}
            />
            <KpiCard
              label="% ocupación promedio"
              value={formatPercent(kpiStats.ocupacion)}
              meta="del mes"
            />
            <KpiCard
              label="Horas libres totales"
              value={formatCompactHours(Math.round(kpiStats.totalLibres))}
              fullValue={formatHours(Math.round(kpiStats.totalLibres))}
              meta="del mes"
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Total BPs activos"
              value={formatNumber(kpiStats.activos, 0)}
            />
            <KpiCard
              label="% ocupación promedio"
              value={formatPercent(kpiStats.ocupacion)}
              meta="anualizado"
            />
            <KpiCard
              label="Horas libres prom."
              value={formatCompactHours(Math.round(kpiStats.libresPromedioMes))}
              fullValue={formatHours(Math.round(kpiStats.libresPromedioMes))}
              meta="por mes"
            />
          </>
        )}
      </div>

      <Tabs value={tab} onChange={setTab} />

      <Section title={`BPs · ${filteredCount}`} flush>
        {loading || !snapshot ? (
          <TableSkeleton />
        ) : filteredCount === 0 ? (
          <EmptyState
            message={
              searchQuery
                ? 'Ningún BP coincide con la búsqueda.'
                : 'Sin BPs cargados.'
            }
          />
        ) : view === 'monthly' && tab === 'horas' ? (
          <DataTable
            columns={horasColumns(setEditing, setDeleting)}
            data={filteredHoras}
            rowKey={(r) => String(r.bp.id)}
            onRowClick={(r) => setDetailing(r.bp)}
          />
        ) : view === 'monthly' && tab === 'rentabilidad' ? (
          <DataTable
            columns={rentabilidadColumns(setEditing, setDeleting)}
            data={filteredRentabilidad}
            rowKey={(r) => String(r.bp.id)}
            onRowClick={(r) => setDetailing(r.bp)}
          />
        ) : tab === 'horas' ? (
          <DataTable
            columns={horasAnnualColumns(setEditing, setDeleting, activeMonths)}
            data={filteredHorasAnnual}
            rowKey={(r) => String(r.bp.id)}
            onRowClick={(r) => setDetailing(r.bp)}
          />
        ) : (
          <DataTable
            columns={rentabilidadAnnualColumns(
              setEditing,
              setDeleting,
              activeMonths
            )}
            data={filteredRentabilidadAnnual}
            rowKey={(r) => String(r.bp.id)}
            onRowClick={(r) => setDetailing(r.bp)}
          />
        )}
      </Section>
    </AppLayout>
  )
}

// --------------------------------------------------------------------------

function Tabs({ value, onChange }: { value: TabKey; onChange: (t: TabKey) => void }) {
  const items: { key: TabKey; label: string }[] = [
    { key: 'horas', label: 'Horas' },
    { key: 'rentabilidad', label: 'Rentabilidad' },
  ]
  return (
    <div role="tablist" className="flex items-center gap-1 mb-4 border-b border-border">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          type="button"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            value === it.key
              ? 'border-accent text-accent'
              : 'border-transparent text-secondary hover:text-primary'
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

function InactivoPill() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-2xs font-medium bg-hover text-tertiary uppercase tracking-wider">
      Inactivo
    </span>
  )
}

/** Tiny "Desde marzo" pill that shows up next to BP names whose fecha_ingreso
 *  is past January. Hidden for January (or null) to keep the roster clean. */
function IngresoPill({ bp }: { bp: BrandPartner }) {
  const mes = getMesIngreso(bp)
  if (mes <= 1) return null
  return (
    <span className="text-2xs text-tertiary whitespace-nowrap">
      Desde {getMonthLabel(mes).toLowerCase()}
    </span>
  )
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
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

/** Tints the cell red/yellow/green by % occupation thresholds. */
function OccupationCell({ pct }: { pct: number }) {
  const tone =
    pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger'
  return (
    <span className={cn('font-mono tabular-nums font-medium', tone)}>
      {formatPercent(pct)}
    </span>
  )
}

/** Tints margen red/green. */
function MargenCell({ value, percent }: { value: number; percent?: number }) {
  const tone = value < 0 ? 'text-danger' : value > 0 ? 'text-success' : 'text-tertiary'
  return (
    <span className={cn('font-mono tabular-nums font-medium', tone)}>
      {formatCurrency(value)}
      {percent !== undefined && (
        <span className="ml-1 text-2xs text-tertiary">
          ({formatPercent(percent)})
        </span>
      )}
    </span>
  )
}

// --------------------------------------------------------------------------
// Columns
// --------------------------------------------------------------------------

function grouperLabel(bp: BrandPartner): string {
  return bp.grouper ?? '—'
}

function horasColumns(
  onEdit: (bp: BrandPartner) => void,
  onDelete: (bp: BrandPartner) => void
): DataTableColumn<BPHorasMonthRow>[] {
  return [
    {
      key: 'nombre',
      accessor: 'bp',
      header: 'Nombre',
      render: (_v, row) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium">{row.bp.nombre}</span>
          {row.bp.activo === false && <InactivoPill />}
          <IngresoPill bp={row.bp} />
        </span>
      ),
    },
    {
      key: 'seniority',
      header: 'Seniority',
      render: (_v, row) => displaySeniority(row.bp) ?? '—',
    },
    {
      key: 'grouper',
      header: 'Grouper',
      render: (_v, row) => (
        <span className="text-secondary">{grouperLabel(row.bp)}</span>
      ),
    },
    {
      key: 'horasContratadas',
      header: 'Contratadas',
      numeric: true,
      render: (_v, row) => formatHours(Math.round(row.horasContratadas)),
    },
    {
      key: 'horasAsignadas',
      header: 'Asignadas',
      numeric: true,
      render: (_v, row) => formatHours(Math.round(row.horasAsignadas)),
    },
    {
      key: 'horasLibres',
      header: 'Libres',
      numeric: true,
      render: (_v, row) => formatHours(Math.round(row.horasLibres)),
    },
    {
      key: 'ocupacion',
      header: '% ocupación',
      numeric: true,
      render: (_v, row) => <OccupationCell pct={row.ocupacion} />,
    },
    {
      key: 'acciones',
      header: '',
      render: (_v, row) => (
        <RowActions
          onEdit={() => onEdit(row.bp)}
          onDelete={() => onDelete(row.bp)}
        />
      ),
    },
  ]
}

function rentabilidadColumns(
  onEdit: (bp: BrandPartner) => void,
  onDelete: (bp: BrandPartner) => void
): DataTableColumn<BPRentabilidadMonthRow>[] {
  return [
    {
      key: 'nombre',
      accessor: 'bp',
      header: 'Nombre',
      render: (_v, row) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium">{row.bp.nombre}</span>
          {row.bp.activo === false && <InactivoPill />}
          <IngresoPill bp={row.bp} />
        </span>
      ),
    },
    {
      key: 'grouper',
      header: 'Grouper',
      render: (_v, row) => (
        <span className="text-secondary">{grouperLabel(row.bp)}</span>
      ),
    },
    {
      key: 'sueldoMensual',
      header: 'Sueldo',
      numeric: true,
      render: (_v, row) =>
        row.sueldoMensual > 0 ? formatCurrency(row.sueldoMensual) : '—',
    },
    {
      key: 'ingresoCotizado',
      header: 'Ingreso cotizado',
      numeric: true,
      render: (_v, row) =>
        row.ingresoCotizado > 0 ? formatCurrency(row.ingresoCotizado) : '—',
    },
    {
      key: 'margen',
      header: 'Margen',
      numeric: true,
      render: (_v, row) =>
        row.ingresoCotizado > 0 ? (
          <MargenCell value={row.margen} percent={row.margenPercent} />
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    {
      key: 'acciones',
      header: '',
      render: (_v, row) => (
        <RowActions
          onEdit={() => onEdit(row.bp)}
          onDelete={() => onDelete(row.bp)}
        />
      ),
    },
  ]
}

// --------------------------------------------------------------------------
// Annual columns
// --------------------------------------------------------------------------

function horasAnnualColumns(
  onEdit: (bp: BrandPartner) => void,
  onDelete: (bp: BrandPartner) => void,
  monthsToShow: number[] = MONTHS
): DataTableColumn<BPHorasAnnualAggregate>[] {
  const monthCols: DataTableColumn<BPHorasAnnualAggregate>[] = monthsToShow.map((m) => ({
    key: `mes-${m}`,
    header: getMonthLabel(m).slice(0, 3),
    align: 'right',
    render: (_v, row) => {
      const v = row.byMonth[m - 1] ?? 0
      return v > 0 ? (
        <span className="font-mono text-md tabular-nums">{formatNumber(v, 0)}</span>
      ) : (
        <span className="text-tertiary text-md">—</span>
      )
    },
  }))
  return [
    {
      key: 'nombre',
      header: 'Nombre',
      render: (_v, row) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="font-medium">{row.bp.nombre}</span>
          {row.bp.activo === false && <InactivoPill />}
          <IngresoPill bp={row.bp} />
        </span>
      ),
    },
    {
      key: 'grouper',
      header: 'Grouper',
      render: (_v, row) => (
        <span className="text-secondary">{grouperLabel(row.bp)}</span>
      ),
    },
    {
      key: 'totalContratadas',
      header: 'Contratadas año',
      numeric: true,
      render: (_v, row) => formatHours(Math.round(row.totalContratadas)),
    },
    {
      key: 'totalAsignadas',
      header: 'Asignadas año',
      numeric: true,
      render: (_v, row) => formatHours(Math.round(row.totalAsignadas)),
    },
    {
      key: 'totalLibres',
      header: 'Libres año',
      numeric: true,
      render: (_v, row) => formatHours(Math.round(row.totalLibres)),
    },
    {
      key: 'ocupacionPromedio',
      header: '% ocupación',
      numeric: true,
      render: (_v, row) => <OccupationCell pct={row.ocupacionPromedio} />,
    },
    ...monthCols,
    {
      key: 'acciones',
      header: '',
      render: (_v, row) => (
        <RowActions
          onEdit={() => onEdit(row.bp)}
          onDelete={() => onDelete(row.bp)}
        />
      ),
    },
  ]
}

function rentabilidadAnnualColumns(
  onEdit: (bp: BrandPartner) => void,
  onDelete: (bp: BrandPartner) => void,
  monthsToShow: number[] = MONTHS
): DataTableColumn<BPRentabilidadAnnualAggregate>[] {
  const monthCols: DataTableColumn<BPRentabilidadAnnualAggregate>[] = monthsToShow.map(
    (m) => ({
      key: `mes-${m}`,
      header: getMonthLabel(m).slice(0, 3),
      align: 'right',
      render: (_v, row) => {
        const v = row.byMonth[m - 1] ?? 0
        if (v === 0) return <span className="text-tertiary text-md">—</span>
        const tone =
          v < 0 ? 'text-danger' : v > 0 ? 'text-success' : 'text-tertiary'
        return (
          <span className={cn('font-mono text-md tabular-nums', tone)}>
            {formatCompactCurrency(v)}
          </span>
        )
      },
    })
  )
  return [
    {
      key: 'nombre',
      header: 'Nombre',
      render: (_v, row) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="font-medium">{row.bp.nombre}</span>
          {row.bp.activo === false && <InactivoPill />}
          <IngresoPill bp={row.bp} />
        </span>
      ),
    },
    {
      key: 'grouper',
      header: 'Grouper',
      render: (_v, row) => (
        <span className="text-secondary">{grouperLabel(row.bp)}</span>
      ),
    },
    {
      key: 'sueldoPromedio',
      header: 'Sueldo prom.',
      numeric: true,
      render: (_v, row) =>
        row.sueldoPromedio > 0 ? formatCurrency(row.sueldoPromedio) : '—',
    },
    {
      key: 'totalIngreso',
      header: 'Ingreso año',
      numeric: true,
      render: (_v, row) =>
        row.totalIngreso > 0 ? formatCurrency(row.totalIngreso) : '—',
    },
    {
      key: 'totalMargen',
      header: 'Margen año',
      numeric: true,
      render: (_v, row) =>
        row.totalIngreso > 0 ? (
          <MargenCell value={row.totalMargen} percent={row.margenPercent} />
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    ...monthCols,
    {
      key: 'acciones',
      header: '',
      render: (_v, row) => (
        <RowActions
          onEdit={() => onEdit(row.bp)}
          onDelete={() => onDelete(row.bp)}
        />
      ),
    },
  ]
}

