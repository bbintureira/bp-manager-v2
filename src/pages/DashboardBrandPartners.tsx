import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader } from '@/components/layout/page-header'
import { NewBPDialog } from '@/components/dialogs/NewBPDialog'
import { EditBPDialog } from '@/components/dialogs/EditBPDialog'
import { BPDetailModal } from '@/components/dialogs/BPDetailModal'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { KpiCard } from '@/components/ui/kpi-card'
import {
  EmptyState,
  ErrorBanner,
  KpiSkeletonGrid,
  TableSkeleton,
} from '@/components/ui/loading-states'
import { getMonthLabel } from '@/components/ui/month-picker'
import {
  PeriodPicker,
  mesPeriodo,
  periodoLabel,
  periodoMeses,
  periodoPrimerMes,
  type Periodo,
} from '@/components/ui/period-picker'
import { Section } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
import { Tabs } from '@/components/ui/tabs'
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
  bpHorasPeriodRow,
  bpRentabilidadAnnualAggregate,
  bpRentabilidadPeriodRow,
  bpRentabilidadYear,
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
  type AnnualSnapshot,
  type BrandPartner,
  type DashboardSnapshot,
} from '@/lib/queries'
import { matchesQuery, useSearch } from '@/hooks/useSearch'
import {
  exportBrandPartners,
  exportBrandPartnersHoras,
  exportSueldosYHoras,
  type BPRentabilidadExportRow,
} from '@/utils/exportToExcel'
import {
  importBrandPartners,
  importSueldosYHoras,
} from '@/utils/importFromExcel'
import { ExportButton } from '@/components/ui/export-button'
import { UploadButton } from '@/components/ui/upload-button'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { TOOLTIPS } from '@/constants/tooltips'

const CURRENT_YEAR = new Date().getFullYear()
const defaultPeriodo = (): Periodo => mesPeriodo(new Date().getMonth() + 1)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

const withInfo = (text: string, tip: string) => (
  <span className="inline-flex items-center gap-1">
    {text}
    <InfoTooltip text={tip} />
  </span>
)

type TabKey = 'horas' | 'rentabilidad'

export function DashboardBrandPartners() {
  const [tab, setTab] = useState<TabKey>('horas')
  const [view, setView] = useState<ViewMode>('monthly')
  const [periodo, setPeriodo] = useState<Periodo>(defaultPeriodo)
  const [snapshot, setSnapshot] = useState<
    DashboardSnapshot | AnnualSnapshot | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<BrandPartner | null>(null)
  const [detailing, setDetailing] = useState<BrandPartner | null>(null)
  const [deleting, setDeleting] = useState<BrandPartner | null>(null)

  const [activoFilter, setActivoFilter] = useState<'activos' | 'inactivos' | 'todos'>(
    'activos'
  )

  const { query: searchQuery } = useSearch()

  const fetchData = useCallback(
    async (mode: ViewMode, selected: Periodo) => {
      setLoading(true)
      setError(null)
      try {
        // A quarter needs three months of asignaciones / sueldos, and
        // `getDashboardSnapshot` is single-month — so anything wider than
        // one month pulls the annual snapshot and filters client-side.
        const snap =
          mode === 'annual' || selected.kind === 'trimestre'
            ? await getAnnualSnapshot()
            : await getDashboardSnapshot(selected.mes)
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
    void fetchData(view, periodo)
  }, [view, periodo, fetchData])

  const refetch = useCallback(
    () => fetchData(view, periodo),
    [fetchData, view, periodo]
  )

  const meses = useMemo(() => periodoMeses(periodo), [periodo])
  const scopeMeta = periodo.kind === 'trimestre' ? 'del trimestre' : 'del mes'

  // Build per-tab rows once. Both tabs filter on the same set of BPs but
  // each tab needs different per-BP fields, so we compute both arrays.
  // The period aggregators cover both scopes: with a single mes they
  // return exactly the month row, with a quarter they sum its months.
  const allHorasRows: BPHorasMonthRow[] = useMemo(() => {
    if (!snapshot || view !== 'monthly') return []
    return snapshot.brandPartners.map((bp) =>
      bpHorasPeriodRow(
        bp,
        snapshot.asignaciones,
        snapshot.proyectos,
        meses,
        snapshot.sueldos,
        snapshot.capacidadesMensuales
      )
    )
  }, [snapshot, meses, view])

  const allRentabilidadRows: BPRentabilidadMonthRow[] = useMemo(() => {
    if (!snapshot || view !== 'monthly') return []
    return snapshot.brandPartners.map((bp) =>
      bpRentabilidadPeriodRow(
        bp,
        snapshot.asignaciones,
        snapshot.sueldos,
        snapshot.proyectos,
        snapshot.honorariosMensuales,
        meses,
        snapshot.horasMensuales,
        snapshot.capacidadesMensuales
      )
    )
  }, [snapshot, meses, view])

  const allHorasAnnual: BPHorasAnnualAggregate[] = useMemo(() => {
    if (!snapshot || view !== 'annual') return []
    return snapshot.brandPartners.map((bp) =>
      bpHorasAnnualAggregate(
        bp,
        snapshot.asignaciones,
        snapshot.proyectos,
        snapshot.sueldos,
        snapshot.capacidadesMensuales
      )
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
        snapshot.honorariosMensuales,
        snapshot.horasMensuales,
        snapshot.capacidadesMensuales
      )
    )
  }, [snapshot, view])

  function bpPasses(bp: BrandPartner): boolean {
    if (!matchesQuery(bp.nombre, searchQuery)) return false
    const isActive = bp.activo !== false
    if (activoFilter === 'activos' && !isActive) return false
    if (activoFilter === 'inactivos' && isActive) return false
    return true
  }

  // Monthly view hides BPs that have no asignacion in the selected mes
  // — the table mirrors what's actually scheduled. Annual view keeps
  // every BP because the columns aggregate across the year.
  const filteredHoras = useMemo(
    () =>
      allHorasRows.filter(
        (r) => bpPasses(r.bp) && r.horasAsignadas > 0
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allHorasRows, searchQuery, activoFilter]
  )
  const filteredRentabilidad = useMemo(
    () =>
      allRentabilidadRows.filter(
        (r) => bpPasses(r.bp) && r.byProject.length > 0
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRentabilidadRows, searchQuery, activoFilter]
  )
  const filteredHorasAnnual = useMemo(
    () => allHorasAnnual.filter((r) => bpPasses(r.bp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allHorasAnnual, searchQuery, activoFilter]
  )
  const filteredRentabilidadAnnual = useMemo(
    () => allRentabilidadAnnual.filter((r) => bpPasses(r.bp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRentabilidadAnnual, searchQuery, activoFilter]
  )

  // KPIs adapt to the active tab. Horas shows team utilization;
  // Rentabilidad shows margen / cobertura salarial aggregates. Both use
  // the filtered set so KPIs always reflect what's visible in the table.
  const kpiStats = useMemo(() => {
    const monthly = view === 'monthly'

    if (tab === 'rentabilidad') {
      if (monthly) {
        const totalMargen = filteredRentabilidad.reduce(
          (s, r) => s + r.margen,
          0
        )
        const totalCobertura = filteredRentabilidad.reduce(
          (s, r) => s + r.coberturaSalarial,
          0
        )
        const total = filteredRentabilidad.length
        // BP "covered" when ingreso_cotizado ≥ sueldo → coberturaSalarial ≥ 0.
        const covered = filteredRentabilidad.filter(
          (r) => r.sueldoMensual > 0 && r.coberturaSalarial >= 0
        ).length
        const pctCovered = total === 0 ? 0 : (covered / total) * 100
        return {
          kind: 'rentabilidad-mes' as const,
          totalMargen,
          totalCobertura,
          pctCovered,
          total,
          covered,
        }
      }
      const totalMargen = filteredRentabilidadAnnual.reduce(
        (s, r) => s + r.totalMargen,
        0
      )
      const totalCobertura = filteredRentabilidadAnnual.reduce(
        (s, r) => s + r.totalCoberturaSalarial,
        0
      )
      const total = filteredRentabilidadAnnual.length
      const covered = filteredRentabilidadAnnual.filter(
        (r) => r.totalSueldo > 0 && r.totalCoberturaSalarial >= 0
      ).length
      const pctCovered = total === 0 ? 0 : (covered / total) * 100
      return {
        kind: 'rentabilidad-año' as const,
        totalMargen,
        totalCobertura,
        pctCovered,
        total,
        covered,
      }
    }

    // tab === 'horas'
    const rows = monthly ? filteredHoras : filteredHorasAnnual
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
      // Idle KPI uses the clamped value: over-assignment in one BP must
      // not cancel out real idle capacity in another.
      const totalLibres = filteredHoras.reduce((s, r) => s + r.horasOciosas, 0)
      const totalCostoLibres = filteredHoras.reduce(
        (s, r) => s + r.costoHorasLibres,
        0
      )
      const ocupacion =
        totalContratadas > 0 ? (totalAsignadas / totalContratadas) * 100 : 0
      return {
        kind: 'mes' as const,
        activos,
        ocupacion,
        totalLibres,
        totalCostoLibres,
      }
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
    const totalCostoLibres = filteredHorasAnnual.reduce(
      (s, r) => s + r.costoHorasLibres,
      0
    )
    const ocupacion =
      totalContratadas > 0 ? (totalAsignadas / totalContratadas) * 100 : 0
    // Year has 12 months — fixed denominator so the metric is comparable
    // across teams of different sizes.
    const libresPromedioMes = totalLibres / 12
    return {
      kind: 'año' as const,
      activos,
      ocupacion,
      libresPromedioMes,
      totalCostoLibres,
    }
  }, [
    tab,
    view,
    filteredHoras,
    filteredHorasAnnual,
    filteredRentabilidad,
    filteredRentabilidadAnnual,
  ])

  const topbarActions = (
    <div className="flex items-center gap-2">
      <ViewToggle value={view} onChange={setView} />
      {view === 'monthly' && (
        <PeriodPicker value={periodo} onChange={setPeriodo} />
      )}
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
          view === 'monthly'
            ? `${periodoLabel(periodo)} ${CURRENT_YEAR}`
            : `Año ${CURRENT_YEAR}`
        } · ${tab === 'horas' ? 'Utilización de horas' : 'Rentabilidad en pesos'}`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExportButton
              label="Descargar rentabilidad"
              onExport={async () => {
                // Always pull the annual snapshot fresh for exports so
                // the file carries the full 12 months even if the page
                // is currently in month-scoped view.
                const snap = await getAnnualSnapshot()
                const rows: BPRentabilidadExportRow[] = snap.brandPartners.map(
                  (bp) => {
                    const year = bpRentabilidadYear(
                      bp,
                      snap.asignaciones,
                      snap.sueldos,
                      snap.proyectos,
                      snap.honorariosMensuales,
                      snap.horasMensuales,
                      snap.capacidadesMensuales
                    )
                    return {
                      bp,
                      ingresosPorMes: year.byMonth.map((m) => m.ingresoCotizado),
                      costosPorMes: year.byMonth.map((m) => m.costo),
                      margenesPorMes: year.byMonth.map((m) => m.margen),
                    }
                  }
                )
                exportBrandPartners(rows)
              }}
            />
            <ExportButton
              label="Descargar horas"
              onExport={async () => {
                const snap = await getAnnualSnapshot()
                exportBrandPartnersHoras(snap.brandPartners, snap.asignaciones)
              }}
            />
            <ExportButton
              label="Descargar sueldos y horas"
              onExport={async () => {
                const snap = await getAnnualSnapshot()
                exportSueldosYHoras({
                  brandPartners: snap.brandPartners,
                  sueldos: snap.sueldos,
                  capacidades: snap.capacidadesMensuales,
                  asignaciones: snap.asignaciones,
                })
              }}
            />
            <UploadButton
              label="Subir sueldos y horas"
              onFile={importSueldosYHoras}
              onComplete={refetch}
              disabled={!snapshot || loading}
            />
            <UploadButton
              label="Subir Excel"
              onFile={importBrandPartners}
              onComplete={refetch}
              disabled={!snapshot || loading}
            />
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              Nuevo BP
            </Button>
          </div>
        }
      />

      <NewBPDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={refetch}
      />
      <EditBPDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        bp={editing}
        onSaved={refetch}
      />
      <BPDetailModal
        open={detailing !== null}
        onOpenChange={(o) => !o && setDetailing(null)}
        bp={detailing}
        activeTab={tab}
        // The detail modal is month-scoped; a quarter opens on its first
        // month (the modal has its own month navigation from there).
        mes={periodoPrimerMes(periodo)}
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

      <div
        className={cn(
          'grid grid-cols-2 gap-3 mb-6',
          tab === 'horas' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        )}
      >
        {loading || !snapshot ? (
          <KpiSkeletonGrid count={tab === 'horas' ? 4 : 3} />
        ) : kpiStats.kind === 'mes' ? (
          <>
            <KpiCard
              label="Total BPs activos"
              value={formatNumber(kpiStats.activos, 0)}
            />
            <KpiCard
              label={withInfo('% ocupación promedio', TOOLTIPS.ocupacionPromedio)}
              value={formatPercent(kpiStats.ocupacion)}
              meta={scopeMeta}
            />
            <KpiCard
              label={withInfo('Horas libres totales', TOOLTIPS.horasLibresTotales)}
              value={formatCompactHours(Math.round(kpiStats.totalLibres))}
              fullValue={formatHours(Math.round(kpiStats.totalLibres))}
              meta={scopeMeta}
            />
            <KpiCard
              label={withInfo('Costo libres total', TOOLTIPS.costoHorasLibresColumna)}
              value={
                <span className={kpiStats.totalCostoLibres > 0 ? 'text-warning' : undefined}>
                  {formatCompactCurrency(kpiStats.totalCostoLibres)}
                </span>
              }
              fullValue={formatCurrency(kpiStats.totalCostoLibres)}
              meta={`ociosidad ${scopeMeta}`}
            />
          </>
        ) : kpiStats.kind === 'año' ? (
          <>
            <KpiCard
              label="Total BPs activos"
              value={formatNumber(kpiStats.activos, 0)}
            />
            <KpiCard
              label={withInfo('% ocupación promedio', TOOLTIPS.ocupacionPromedio)}
              value={formatPercent(kpiStats.ocupacion)}
              meta="anualizado"
            />
            <KpiCard
              label="Horas libres prom."
              value={formatCompactHours(Math.round(kpiStats.libresPromedioMes))}
              fullValue={formatHours(Math.round(kpiStats.libresPromedioMes))}
              meta="por mes"
            />
            <KpiCard
              label={withInfo('Costo libres total', TOOLTIPS.costoHorasLibresColumna)}
              value={
                <span className={kpiStats.totalCostoLibres > 0 ? 'text-warning' : undefined}>
                  {formatCompactCurrency(kpiStats.totalCostoLibres)}
                </span>
              }
              fullValue={formatCurrency(kpiStats.totalCostoLibres)}
              meta="ociosidad del año"
            />
          </>
        ) : kpiStats.kind === 'rentabilidad-mes' ? (
          <>
            <KpiCard
              label={withInfo('Margen total', TOOLTIPS.margenTotal)}
              value={formatCompactCurrency(kpiStats.totalMargen)}
              fullValue={formatCurrency(kpiStats.totalMargen)}
              meta={scopeMeta}
            />
            <KpiCard
              label={withInfo('Cobertura salarial total', TOOLTIPS.coberturaSalarialTotal)}
              value={formatCompactCurrency(kpiStats.totalCobertura)}
              fullValue={formatCurrency(kpiStats.totalCobertura)}
              meta="ingreso − sueldo"
            />
            <KpiCard
              label={withInfo('% BPs con ingreso ≥ sueldo', TOOLTIPS.bpsConCostoMayorSueldo)}
              value={formatPercent(kpiStats.pctCovered)}
              meta={`${kpiStats.covered} de ${kpiStats.total}`}
            />
          </>
        ) : (
          <>
            <KpiCard
              label={withInfo('Margen total', TOOLTIPS.margenTotal)}
              value={formatCompactCurrency(kpiStats.totalMargen)}
              fullValue={formatCurrency(kpiStats.totalMargen)}
              meta="del año"
            />
            <KpiCard
              label={withInfo('Cobertura salarial total', TOOLTIPS.coberturaSalarialTotal)}
              value={formatCompactCurrency(kpiStats.totalCobertura)}
              fullValue={formatCurrency(kpiStats.totalCobertura)}
              meta="ingreso − sueldo (año)"
            />
            <KpiCard
              label={withInfo('% BPs con ingreso ≥ sueldo', TOOLTIPS.bpsConCostoMayorSueldo)}
              value={formatPercent(kpiStats.pctCovered)}
              meta={`${kpiStats.covered} de ${kpiStats.total}`}
            />
          </>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Vista de Brand Partners"
        items={[
          { key: 'horas', label: 'Horas' },
          { key: 'rentabilidad', label: 'Rentabilidad' },
        ]}
      />

      <Section title={`BPs · ${filteredCount}`} flush>
        {loading || !snapshot ? (
          <TableSkeleton />
        ) : filteredCount === 0 ? (
          <EmptyState
            message={
              searchQuery
                ? 'Ningún BP coincide con la búsqueda.'
                : view === 'monthly'
                  ? 'No hay datos para este período.'
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
            footer={rentabilidadFooter(filteredRentabilidad)}
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
            footer={rentabilidadAnnualFooter(filteredRentabilidadAnnual)}
          />
        )}
      </Section>
    </AppLayout>
  )
}

// --------------------------------------------------------------------------

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

/** Commercial difference (HC − HA): plata in green/red with the hours diff
 *  as a secondary line. Positive = over-quoted (agency saves). */
function ComercialDiffCell({ horas, plata }: { horas: number; plata: number }) {
  const rHoras = Math.round(horas)
  if (Math.round(plata) === 0 && rHoras === 0) {
    return <span className="text-tertiary">—</span>
  }
  const tone =
    plata > 0 ? 'text-success' : plata < 0 ? 'text-danger' : 'text-tertiary'
  const sign = plata > 0 ? '+' : plata < 0 ? '−' : ''
  const hSign = rHoras > 0 ? '+' : rHoras < 0 ? '−' : ''
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={cn('font-mono tabular-nums font-medium', tone)}>
        {sign}
        {formatCurrency(Math.abs(plata))}
      </span>
      <span className="text-2xs text-tertiary font-mono tabular-nums">
        {hSign}
        {formatHours(Math.abs(rHoras))}
      </span>
    </span>
  )
}

/** Horas libres (contratadas − asignadas). Negative = over-assigned, shown
 *  in red with an explicit minus so it reads as "sobrevendido". */
function LibresCell({ horas }: { horas: number }) {
  const rounded = Math.round(horas)
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        rounded < 0 && 'text-danger font-medium'
      )}
    >
      {rounded < 0 ? '−' : ''}
      {formatHours(Math.abs(rounded))}
    </span>
  )
}

/** Signed currency, red when negative. Used for the sueldo ocioso column. */
function OciosoCell({ value }: { value: number }) {
  const rounded = Math.round(value)
  if (rounded === 0) return <span className="text-tertiary">—</span>
  return (
    <span
      className={cn(
        'font-mono tabular-nums font-medium',
        rounded > 0 ? 'text-warning' : 'text-danger'
      )}
    >
      {rounded < 0 ? '−' : ''}
      {formatCurrency(Math.abs(value))}
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
      header: withInfo('Libres', TOOLTIPS.horasLibresColumna),
      numeric: true,
      // Signed: a negative value means the BP is over-assigned (sold
      // beyond capacity) — that's information, not a zero.
      render: (_v, row) => <LibresCell horas={row.horasLibres} />,
    },
    {
      key: 'costoHorasLibres',
      header: withInfo('Costo libres', TOOLTIPS.costoHorasLibresColumna),
      numeric: true,
      render: (_v, row) =>
        row.costoHorasLibres > 0 ? (
          <span className="text-warning">
            {formatCurrency(row.costoHorasLibres)}
          </span>
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    {
      key: 'ocupacion',
      header: withInfo('% ocupación', TOOLTIPS.ocupacionColumna),
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
    // The six standardized metrics per BP, in the order Vicky asked for.
    // Formulas are the pre-existing ones — only `sueldoOcioso` is new.
    {
      key: 'sueldoMensual',
      header: 'Sueldo',
      numeric: true,
      render: (_v, row) =>
        row.sueldoMensual > 0 ? formatCurrency(row.sueldoMensual) : '—',
    },
    {
      key: 'ingresoCotizado',
      header: withInfo(
        'Sueldo cubierto comercialmente',
        TOOLTIPS.sueldoCubiertoComercialmente
      ),
      numeric: true,
      render: (_v, row) =>
        row.ingresoCotizado > 0 ? formatCurrency(row.ingresoCotizado) : '—',
    },
    {
      key: 'costo',
      header: withInfo('Sueldo ocupado', TOOLTIPS.sueldoOcupado),
      numeric: true,
      render: (_v, row) => (row.costo > 0 ? formatCurrency(row.costo) : '—'),
    },
    {
      key: 'margen',
      header: withInfo('Dif. cubierto vs ocupado', TOOLTIPS.difCubiertoOcupado),
      numeric: true,
      render: (_v, row) =>
        row.ingresoCotizado > 0 ? (
          <MargenCell value={row.margen} percent={row.margenPercent} />
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    {
      key: 'sueldoOcioso',
      header: withInfo('Sueldo ocioso', TOOLTIPS.sueldoOcioso),
      numeric: true,
      render: (_v, row) =>
        row.sueldoMensual > 0 ? (
          <OciosoCell value={row.sueldoOcioso} />
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    {
      key: 'coberturaSalarial',
      header: withInfo('Cobertura', TOOLTIPS.coberturaSalarialColumna),
      numeric: true,
      render: (_v, row) =>
        row.sueldoMensual > 0 ? (
          <MargenCell value={row.coberturaSalarial} />
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    // Kept as a secondary reference — the project-level view is now the
    // primary home of the commercial difference.
    {
      key: 'diferenciaComercial',
      header: withInfo('Dif. comercial', TOOLTIPS.diferenciaComercialColumna),
      numeric: true,
      render: (_v, row) =>
        row.byProject.length > 0 ? (
          <ComercialDiffCell
            horas={row.diferenciaComercialHoras}
            plata={row.diferenciaComercial}
          />
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

/** Totals row for the Rentabilidad table — one entry per numeric column,
 *  keys must match the column keys above. */
function rentabilidadFooter(rows: BPRentabilidadMonthRow[]) {
  const sum = (pick: (r: BPRentabilidadMonthRow) => number) =>
    rows.reduce((s, r) => s + pick(r), 0)
  const ingreso = sum((r) => r.ingresoCotizado)
  const costo = sum((r) => r.costo)
  return {
    nombre: 'Totales',
    sueldoMensual: formatCurrency(sum((r) => r.sueldoMensual)),
    ingresoCotizado: formatCurrency(ingreso),
    costo: formatCurrency(costo),
    margen: <MargenCell value={ingreso - costo} />,
    sueldoOcioso: <OciosoCell value={sum((r) => r.sueldoOcioso)} />,
    coberturaSalarial: <MargenCell value={sum((r) => r.coberturaSalarial)} />,
    diferenciaComercial: (
      <ComercialDiffCell
        horas={sum((r) => r.diferenciaComercialHoras)}
        plata={sum((r) => r.diferenciaComercial)}
      />
    ),
  }
}

function rentabilidadAnnualFooter(rows: BPRentabilidadAnnualAggregate[]) {
  const sum = (pick: (r: BPRentabilidadAnnualAggregate) => number) =>
    rows.reduce((s, r) => s + pick(r), 0)
  const ingreso = sum((r) => r.totalIngreso)
  const costo = sum((r) => r.totalCosto)
  return {
    nombre: 'Totales',
    totalSueldo: formatCurrency(sum((r) => r.totalSueldo)),
    totalIngreso: formatCurrency(ingreso),
    totalCosto: formatCurrency(costo),
    totalMargen: <MargenCell value={ingreso - costo} />,
    totalSueldoOcioso: <OciosoCell value={sum((r) => r.totalSueldoOcioso)} />,
    coberturaSalarial: (
      <MargenCell value={sum((r) => r.totalCoberturaSalarial)} />
    ),
    diferenciaComercial: (
      <ComercialDiffCell
        horas={sum((r) => r.totalDiferenciaComercialHoras)}
        plata={sum((r) => r.totalDiferenciaComercial)}
      />
    ),
  }
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
      key: 'costoHorasLibres',
      header: withInfo('Costo libres', TOOLTIPS.costoHorasLibresColumna),
      numeric: true,
      render: (_v, row) =>
        row.costoHorasLibres > 0 ? (
          <span className="text-warning">
            {formatCurrency(row.costoHorasLibres)}
          </span>
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    {
      key: 'ocupacionPromedio',
      header: withInfo('% ocupación', TOOLTIPS.ocupacionColumna),
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
    // Same six metrics as the monthly table, aggregated over the months
    // the BP actually had assignments.
    {
      key: 'totalSueldo',
      header: 'Sueldo año',
      numeric: true,
      render: (_v, row) =>
        row.totalSueldo > 0 ? formatCurrency(row.totalSueldo) : '—',
    },
    {
      key: 'totalIngreso',
      header: withInfo(
        'Sueldo cubierto comercialmente',
        TOOLTIPS.sueldoCubiertoComercialmente
      ),
      numeric: true,
      render: (_v, row) =>
        row.totalIngreso > 0 ? formatCurrency(row.totalIngreso) : '—',
    },
    {
      key: 'totalCosto',
      header: withInfo('Sueldo ocupado', TOOLTIPS.sueldoOcupado),
      numeric: true,
      render: (_v, row) =>
        row.totalCosto > 0 ? formatCurrency(row.totalCosto) : '—',
    },
    {
      key: 'totalMargen',
      header: withInfo('Dif. cubierto vs ocupado', TOOLTIPS.difCubiertoOcupado),
      numeric: true,
      render: (_v, row) =>
        row.totalIngreso > 0 ? (
          <MargenCell value={row.totalMargen} percent={row.margenPercent} />
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    {
      key: 'totalSueldoOcioso',
      header: withInfo('Sueldo ocioso', TOOLTIPS.sueldoOcioso),
      numeric: true,
      render: (_v, row) =>
        row.totalSueldo > 0 ? (
          <OciosoCell value={row.totalSueldoOcioso} />
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    {
      key: 'coberturaSalarial',
      header: withInfo('Cobertura', TOOLTIPS.coberturaSalarialColumna),
      numeric: true,
      render: (_v, row) =>
        row.totalSueldo > 0 ? (
          <MargenCell value={row.totalCoberturaSalarial} />
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    {
      key: 'diferenciaComercial',
      header: withInfo('Dif. comercial', TOOLTIPS.diferenciaComercialColumna),
      numeric: true,
      render: (_v, row) =>
        row.totalIngreso > 0 ? (
          <ComercialDiffCell
            horas={row.totalDiferenciaComercialHoras}
            plata={row.totalDiferenciaComercial}
          />
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

