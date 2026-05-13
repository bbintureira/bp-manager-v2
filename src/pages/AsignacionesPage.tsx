import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileDown, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader } from '@/components/layout/page-header'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  DataTable,
  type DataTableColumn,
} from '@/components/ui/data-table'
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
import { KpiCard } from '@/components/ui/kpi-card'
import {
  EmptyState,
  ErrorBanner,
  KpiSkeletonGrid,
  TableSkeleton,
} from '@/components/ui/loading-states'
import { getMonthLabel } from '@/components/ui/month-picker'
import { Section } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCurrency, formatHours, formatNumber, formatPercent } from '@/lib/format'
import {
  HOURS_PER_MONTH,
  getMesEgreso,
  getMesIngreso,
  summarizeAllProjectsRentabilidad,
  summarizeBPsAnnual,
  summarizeProjectsAnnual,
  type BPAnnualSummary,
  type ProjectAnnualSummary,
  type ProjectRentabilidadSummary,
} from '@/lib/calculations'
import {
  deleteAsignacionesForBp,
  getAsignaciones,
  getBPAsignacionesFullYear,
  getBrandPartners,
  getProjectAsignacionesFullYear,
  getProyectos,
  getSueldos,
  updateAsignacionFullYear,
  type Asignacion,
  type BPAsignacionesFullYear,
  type BrandPartner,
  type ProjectAsignacionesFullYear,
  type Proyecto,
  type Sueldo,
} from '@/lib/queries'
import { matchesQuery, useSearch } from '@/hooks/useSearch'
import { displaySeniority } from '@/lib/seniority'
import { exportAsignaciones } from '@/utils/exportToExcel'
import { cn } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** Annual capacity for a BP using the new "only count months with at
 *  least one asignacion" rule (so future / empty months don't inflate
 *  the denominator). Constrained to the BP's [ingreso, egreso] window.
 *  Falls back to `12 × HOURS_PER_MONTH` if `bp` is null. */
function annualHoursForBP(
  bp: BrandPartner | null | undefined,
  sueldos: Sueldo[] = [],
  asignaciones: Asignacion[] = []
): number {
  if (!bp) return HOURS_PER_MONTH * 12
  const mesIngreso = getMesIngreso(bp)
  const mesEgreso = getMesEgreso(bp, sueldos)
  const capacidad =
    bp.capacidad_horas_mensual != null && Number(bp.capacidad_horas_mensual) > 0
      ? Number(bp.capacidad_horas_mensual)
      : HOURS_PER_MONTH
  const monthsWithAsig = new Set<number>()
  for (const a of asignaciones) {
    if (String(a.bp_id) !== String(bp.id)) continue
    const m = Number(a.mes)
    if (!Number.isFinite(m) || m < mesIngreso || m > mesEgreso) continue
    if (Number(a.horas) <= 0) continue
    monthsWithAsig.add(m)
  }
  return capacidad * monthsWithAsig.size
}

// Both modes use the same edit state shape — the key just means different
// things: in project mode it's bp_id, in BP mode it's proyecto_id.
type EditState = Record<string, number[]> // entityId -> 12 hours

type Mode = 'all' | 'proyecto' | 'bp'

// --------------------------------------------------------------------------

export function AsignacionesPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [brandPartners, setBrandPartners] = useState<BrandPartner[]>([])
  /** Annual sueldos cache — needed to compute mesEgreso for inactive BPs
   *  so the utilization denominators in this page stop at their last
   *  paid month instead of always running through December. */
  const [allSueldos, setAllSueldos] = useState<Sueldo[]>([])
  /** All persisted asignaciones across projects. Used to compute each BP's
   *  annual "contratadas" = months_with_asignacion × capacidad. */
  const [allAsignaciones, setAllAsignaciones] = useState<Asignacion[]>([])

  // Selection lives in the URL: ?p=<id> for per-project mode, ?bp=<id>
  // for per-BP mode. Both empty → flat all-projects list. Setting one
  // clears the other so we never end up in an ambiguous state. Clicking
  // the sidebar "Asignaciones" link (no params) resets to the all view.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedProyectoId = searchParams.get('p') ?? ''
  const selectedBpId = searchParams.get('bp') ?? ''
  const mode: Mode = selectedProyectoId
    ? 'proyecto'
    : selectedBpId
      ? 'bp'
      : 'all'

  const setSelectedProyectoId = useCallback(
    (id: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('p', id)
        else next.delete('p')
        next.delete('bp')
        return next
      })
    },
    [setSearchParams]
  )
  const setSelectedBpId = useCallback(
    (id: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('bp', id)
        else next.delete('bp')
        next.delete('p')
        return next
      })
    },
    [setSearchParams]
  )

  // Per-project (?p=) edit state — `bpOrder` is keyed by bp_id.
  const [data, setData] = useState<ProjectAsignacionesFullYear | null>(null)
  const [bpOrder, setBpOrder] = useState<string[]>([])
  const [edits, setEdits] = useState<EditState>({})
  const [initial, setInitial] = useState<EditState>({})

  // Per-BP (?bp=) edit state — `proyectoOrder` is keyed by proyecto_id.
  const [bpData, setBpData] = useState<BPAsignacionesFullYear | null>(null)
  const [proyectoOrder, setProyectoOrder] = useState<string[]>([])
  const [bpEdits, setBpEdits] = useState<EditState>({})
  const [bpInitial, setBpInitial] = useState<EditState>({})

  // "All" view state — one row per project (aggregated).
  const [allRows, setAllRows] = useState<ProjectAnnualSummary[] | null>(null)
  // Same data, sliced by BP. Switched via the toggle in the all view.
  const [allBpRows, setAllBpRows] = useState<BPAnnualSummary[] | null>(null)
  // Rentabilidad summary keyed by proyecto.id (joined into projectColumns).
  const [rentaByProyecto, setRentaByProyecto] = useState<
    Map<string, ProjectRentabilidadSummary>
  >(() => new Map())
  const [allView, setAllView] = useState<'proyectos' | 'bps'>('proyectos')

  const [loadingProyectos, setLoadingProyectos] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [addingOpen, setAddingOpen] = useState(false)
  const [deletingBp, setDeletingBp] = useState<{
    bp_id: string
    name: string
    isPersisted: boolean
  } | null>(null)

  // BP mode counterparts
  const [addingProyectoOpen, setAddingProyectoOpen] = useState(false)
  const [deletingProyecto, setDeletingProyecto] = useState<{
    proyecto_id: string
    name: string
    isPersisted: boolean
  } | null>(null)

  const { query: searchQuery } = useSearch()

  // ----- one-time load of proyectos + BPs (for the dropdowns)
  useEffect(() => {
    let cancelled = false
    setLoadingProyectos(true)
    void Promise.all([getProyectos(), getBrandPartners()])
      .then(([p, b]) => {
        if (cancelled) return
        setProyectos(p)
        setBrandPartners(b)
      })
      .finally(() => {
        if (!cancelled) setLoadingProyectos(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ----- per-project loader (editable grid)
  const loadProject = useCallback(async (proyecto_id: string) => {
    setLoading(true)
    setError(null)
    try {
      const detail = await getProjectAsignacionesFullYear(proyecto_id)
      setData(detail)
      const order = detail.rows.map((r) => r.bp_id)
      const initState: EditState = {}
      for (const r of detail.rows) initState[r.bp_id] = r.horas_por_mes.slice()
      setBpOrder(order)
      setEdits(initState)
      setInitial(initState)
    } catch (e) {
      console.error('[asignaciones] load project failed', e)
      setError('No se pudieron cargar las asignaciones del proyecto.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // ----- per-BP loader (inverse editable grid: rows = projects)
  const loadBp = useCallback(async (bp_id: string) => {
    setLoading(true)
    setError(null)
    try {
      const detail = await getBPAsignacionesFullYear(bp_id)
      setBpData(detail)
      const order = detail.rows.map((r) => r.proyecto_id)
      const initState: EditState = {}
      for (const r of detail.rows)
        initState[r.proyecto_id] = r.horas_por_mes.slice()
      setProyectoOrder(order)
      setBpEdits(initState)
      setBpInitial(initState)
    } catch (e) {
      console.error('[asignaciones] load BP failed', e)
      setError('No se pudieron cargar las asignaciones del BP.')
      setBpData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // ----- "all" loader: one row per project, aggregated across the year.
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ps, bps, asignaciones, sueldos] = await Promise.all([
        getProyectos(),
        getBrandPartners(),
        getAsignaciones(),
        getSueldos(),
      ])
      setProyectos(ps)
      setBrandPartners(bps)
      setAllSueldos(sueldos)
      setAllAsignaciones(asignaciones)
      // Show every project — including ones without any asignaciones yet.
      // This is the natural landing point to add BPs to a freshly-created
      // project. Sort by hours desc so the active ones float up; ties
      // broken by name.
      const rows = summarizeProjectsAnnual(ps, asignaciones, sueldos)
      rows.sort((a, b) => {
        if (a.totalHoras !== b.totalHoras) return b.totalHoras - a.totalHoras
        return a.proyecto.nombre.localeCompare(b.proyecto.nombre)
      })
      setAllRows(rows)

      // Same datasource, pivoted by BP.
      const bpRows = summarizeBPsAnnual(bps, asignaciones, sueldos)
        .filter((b) => b.totalHoras > 0)
      bpRows.sort((a, b) => b.totalHoras - a.totalHoras)
      setAllBpRows(bpRows)

      // Rentabilidad summary using the new model.
      const renta = summarizeAllProjectsRentabilidad(ps, asignaciones, bps)
      const rentaMap = new Map(renta.map((r) => [String(r.proyecto.id), r]))
      setRentaByProyecto(rentaMap)
    } catch (e) {
      console.error('[asignaciones] load all failed', e)
      setError('No se pudieron cargar las asignaciones.')
      setAllRows(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mode === 'all') {
      setData(null)
      setBpOrder([])
      setEdits({})
      setInitial({})
      setBpData(null)
      setProyectoOrder([])
      setBpEdits({})
      setBpInitial({})
      void loadAll()
    } else if (mode === 'proyecto') {
      setAllRows(null)
      setBpData(null)
      setProyectoOrder([])
      setBpEdits({})
      setBpInitial({})
      void loadProject(selectedProyectoId)
    } else {
      setAllRows(null)
      setData(null)
      setBpOrder([])
      setEdits({})
      setInitial({})
      void loadBp(selectedBpId)
    }
  }, [mode, selectedProyectoId, selectedBpId, loadAll, loadProject, loadBp])

  // ----- derived (project mode)
  const dirty = useMemo(() => {
    for (const bp_id of Object.keys(edits)) {
      const cur = edits[bp_id]
      const init = initial[bp_id]
      if (!init) {
        if (cur.some((v) => v > 0)) return true
      } else if (cur.some((v, i) => v !== init[i])) {
        return true
      }
    }
    return false
  }, [edits, initial])

  const visibleBpIds = useMemo(() => {
    if (!searchQuery) return bpOrder
    return bpOrder.filter((id) => {
      const name =
        brandPartners.find((b) => String(b.id) === id)?.nombre ?? ''
      return matchesQuery(name, searchQuery)
    })
  }, [bpOrder, brandPartners, searchQuery])

  const stats = useMemo(() => {
    const bpById = new Map(brandPartners.map((bp) => [String(bp.id), bp]))
    const totals = bpOrder.map((id) => {
      const arr = edits[id] ?? []
      return arr.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0)
    })
    const totalHoras = totals.reduce((s, x) => s + x, 0)
    const numBps = bpOrder.filter((id) => totals[bpOrder.indexOf(id)] > 0).length
    // Available hours: per-BP annual capacity respecting fecha_ingreso,
    // summed across the BPs in the table.
    const availableHoras = bpOrder.reduce(
      (s, id) =>
        s + annualHoursForBP(bpById.get(id), allSueldos, allAsignaciones),
      0
    )
    const avgUtilization =
      availableHoras === 0 ? 0 : (totalHoras / availableHoras) * 100
    return { totalHoras, numBps, avgUtilization, availableHoras }
  }, [bpOrder, edits, brandPartners, allSueldos, allAsignaciones])

  // ----- derived (per-project "all" mode)
  const visibleAllRows = useMemo(() => {
    if (!allRows) return []
    if (!searchQuery) return allRows
    return allRows.filter((r) => matchesQuery(r.proyecto.nombre, searchQuery))
  }, [allRows, searchQuery])

  // ----- derived (per-BP "all" mode)
  const visibleAllBpRows = useMemo(() => {
    if (!allBpRows) return []
    if (!searchQuery) return allBpRows
    return allBpRows.filter((r) => matchesQuery(r.bp.nombre, searchQuery))
  }, [allBpRows, searchQuery])

  // ----- handlers (project mode)
  const setCell = useCallback((bp_id: string, idx: number, raw: string) => {
    setEdits((prev) => {
      const cur = prev[bp_id]?.slice() ?? new Array(12).fill(0)
      const parsed = Number(raw)
      cur[idx] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      return { ...prev, [bp_id]: cur }
    })
  }, [])

  const handleAddBp = useCallback((bp_id: string) => {
    setBpOrder((prev) => (prev.includes(bp_id) ? prev : [...prev, bp_id]))
    setEdits((prev) => ({
      ...prev,
      [bp_id]: prev[bp_id] ?? new Array(12).fill(0),
    }))
  }, [])

  const removeBpFromLocal = useCallback((bp_id: string) => {
    setBpOrder((prev) => prev.filter((x) => x !== bp_id))
    setEdits((prev) => {
      const { [bp_id]: _drop, ...rest } = prev
      void _drop
      return rest
    })
  }, [])

  const resetChanges = useCallback(() => {
    setEdits(
      Object.fromEntries(
        Object.entries(initial).map(([k, v]) => [k, v.slice()])
      )
    )
    setBpOrder(Object.keys(initial))
  }, [initial])

  async function handleSave(e?: FormEvent) {
    if (e) e.preventDefault()
    if (!selectedProyectoId || !dirty || submitting) return
    setSubmitting(true)
    const tasks: Promise<{ bp_id: string; ok: boolean; error?: string }>[] = []
    for (const bp_id of bpOrder) {
      const cur = edits[bp_id]
      const init = initial[bp_id]
      const isNew = !init
      const changed = isNew
        ? cur.some((v) => v > 0)
        : cur.some((v, i) => v !== init[i])
      if (!changed) continue
      tasks.push(
        updateAsignacionFullYear(
          selectedProyectoId,
          bp_id,
          MONTHS.map((mes, i) => ({ mes, horas: cur[i] }))
        ).then((r) => ({
          bp_id,
          ok: r.success,
          error: r.success ? undefined : r.error,
        }))
      )
    }
    const results = await Promise.all(tasks)
    setSubmitting(false)
    const failed = results.filter((r) => !r.ok)
    if (failed.length === 0) {
      toast.success(
        results.length === 0
          ? 'Sin cambios para guardar'
          : `Cambios guardados · ${results.length} BPs`
      )
      void loadProject(selectedProyectoId)
    } else {
      toast.error(
        `Falló el guardado en ${failed.length} de ${results.length} BPs`,
        { description: failed[0]?.error }
      )
    }
  }

  async function handleDeleteBp() {
    if (!deletingBp || !selectedProyectoId) return
    if (!deletingBp.isPersisted) {
      removeBpFromLocal(deletingBp.bp_id)
      setDeletingBp(null)
      return
    }
    const result = await deleteAsignacionesForBp(
      selectedProyectoId,
      deletingBp.bp_id
    )
    if (result.success) {
      toast.success('BP removido del proyecto')
      setDeletingBp(null)
      void loadProject(selectedProyectoId)
    } else {
      toast.error('No se pudo eliminar', { description: result.error })
    }
  }

  const availableBps = useMemo(() => {
    const present = new Set(bpOrder)
    return brandPartners.filter((bp) => !present.has(String(bp.id)))
  }, [brandPartners, bpOrder])

  // ----- BP mode derived + handlers
  const bpDirty = useMemo(() => {
    for (const id of Object.keys(bpEdits)) {
      const cur = bpEdits[id]
      const init = bpInitial[id]
      if (!init) {
        if (cur.some((v) => v > 0)) return true
      } else if (cur.some((v, i) => v !== init[i])) {
        return true
      }
    }
    return false
  }, [bpEdits, bpInitial])

  const visibleProyectoIds = useMemo(() => {
    if (!searchQuery) return proyectoOrder
    return proyectoOrder.filter((id) => {
      const name = proyectos.find((p) => String(p.id) === id)?.nombre ?? ''
      return matchesQuery(name, searchQuery)
    })
  }, [proyectoOrder, proyectos, searchQuery])

  const bpStats = useMemo(() => {
    const totals = proyectoOrder.map((id) => {
      const arr = bpEdits[id] ?? []
      return arr.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0)
    })
    const totalHoras = totals.reduce((s, x) => s + x, 0)
    const numProyectos = totals.filter((t) => t > 0).length
    // The BP-view is scoped to a single BP (bpData?.bp). Capacity respects
    // their fecha_ingreso instead of a hardcoded 12 × 160.
    const annualHours = annualHoursForBP(
      bpData?.bp,
      allSueldos,
      allAsignaciones
    )
    const utilization =
      annualHours === 0 ? 0 : (totalHoras / annualHours) * 100
    return { totalHoras, numProyectos, utilization, annualHours }
  }, [proyectoOrder, bpEdits, bpData, allSueldos, allAsignaciones])

  const setBpCell = useCallback((proyecto_id: string, idx: number, raw: string) => {
    setBpEdits((prev) => {
      const cur = prev[proyecto_id]?.slice() ?? new Array(12).fill(0)
      const parsed = Number(raw)
      cur[idx] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
      return { ...prev, [proyecto_id]: cur }
    })
  }, [])

  const handleAddProyecto = useCallback((proyecto_id: string) => {
    setProyectoOrder((prev) =>
      prev.includes(proyecto_id) ? prev : [...prev, proyecto_id]
    )
    setBpEdits((prev) => ({
      ...prev,
      [proyecto_id]: prev[proyecto_id] ?? new Array(12).fill(0),
    }))
  }, [])

  const removeProyectoFromLocal = useCallback((proyecto_id: string) => {
    setProyectoOrder((prev) => prev.filter((x) => x !== proyecto_id))
    setBpEdits((prev) => {
      const { [proyecto_id]: _drop, ...rest } = prev
      void _drop
      return rest
    })
  }, [])

  const resetBpChanges = useCallback(() => {
    setBpEdits(
      Object.fromEntries(
        Object.entries(bpInitial).map(([k, v]) => [k, v.slice()])
      )
    )
    setProyectoOrder(Object.keys(bpInitial))
  }, [bpInitial])

  async function handleSaveBp() {
    if (!selectedBpId || !bpDirty || submitting) return
    setSubmitting(true)
    const tasks: Promise<{
      proyecto_id: string
      ok: boolean
      error?: string
    }>[] = []
    for (const proyecto_id of proyectoOrder) {
      const cur = bpEdits[proyecto_id]
      const init = bpInitial[proyecto_id]
      const isNew = !init
      const changed = isNew
        ? cur.some((v) => v > 0)
        : cur.some((v, i) => v !== init[i])
      if (!changed) continue
      tasks.push(
        updateAsignacionFullYear(
          proyecto_id,
          selectedBpId,
          MONTHS.map((mes, i) => ({ mes, horas: cur[i] }))
        ).then((r) => ({
          proyecto_id,
          ok: r.success,
          error: r.success ? undefined : r.error,
        }))
      )
    }
    const results = await Promise.all(tasks)
    setSubmitting(false)
    const failed = results.filter((r) => !r.ok)
    if (failed.length === 0) {
      toast.success(
        results.length === 0
          ? 'Sin cambios para guardar'
          : `Cambios guardados · ${results.length} proyectos`
      )
      void loadBp(selectedBpId)
    } else {
      toast.error(
        `Falló el guardado en ${failed.length} de ${results.length} proyectos`,
        { description: failed[0]?.error }
      )
    }
  }

  async function handleDeleteProyecto() {
    if (!deletingProyecto || !selectedBpId) return
    if (!deletingProyecto.isPersisted) {
      removeProyectoFromLocal(deletingProyecto.proyecto_id)
      setDeletingProyecto(null)
      return
    }
    const result = await deleteAsignacionesForBp(
      deletingProyecto.proyecto_id,
      selectedBpId
    )
    if (result.success) {
      toast.success('Proyecto removido del BP')
      setDeletingProyecto(null)
      void loadBp(selectedBpId)
    } else {
      toast.error('No se pudo eliminar', { description: result.error })
    }
  }

  const availableProyectos = useMemo(() => {
    const present = new Set(proyectoOrder)
    return proyectos.filter((p) => !present.has(String(p.id)))
  }, [proyectos, proyectoOrder])

  // ----- topbar slot — both selectors are visible at the same time;
  // picking one clears the other (mutually exclusive).
  const topbarActions = (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Proyecto"
        value={selectedProyectoId}
        onChange={(e) => setSelectedProyectoId(e.target.value)}
        disabled={loadingProyectos}
        className="w-auto pr-8 max-w-[240px]"
      >
        <option value="">Todos los proyectos</option>
        {proyectos.map((p) => (
          <option key={String(p.id)} value={String(p.id)}>
            {p.nombre}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Brand Partner"
        value={selectedBpId}
        onChange={(e) => setSelectedBpId(e.target.value)}
        disabled={loadingProyectos}
        className="w-auto pr-8 max-w-[240px]"
      >
        <option value="">Todos los BPs</option>
        {brandPartners.map((bp) => (
          <option key={String(bp.id)} value={String(bp.id)}>
            {bp.nombre}
          </option>
        ))}
      </Select>
    </div>
  )

  const isAll = mode === 'all'
  const isProyecto = mode === 'proyecto'
  const isBp = mode === 'bp'

  return (
    <AppLayout
      breadcrumb={[
        { label: 'Gestión' },
        { label: 'Asignaciones', active: true },
      ]}
      topbarActions={topbarActions}
    >
      <PageHeader
        title="Asignaciones"
        subtitle={
          isAll
            ? `${visibleAllRows.length} de ${allRows?.length ?? 0} proyectos con asignaciones${searchQuery ? ' (filtrados)' : ''}`
            : isProyecto
              ? data?.proyecto
                ? `${data.proyecto.nombre}${data.proyecto.tipo ? ` · ${data.proyecto.tipo}` : ''}`
                : 'Cargando proyecto…'
              : bpData?.bp
                ? (() => {
                    const sen = displaySeniority(bpData.bp)
                    return `${bpData.bp.nombre}${sen ? ` · ${sen}` : ''}`
                  })()
                : 'Cargando BP…'
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                exportAsignaciones(allAsignaciones, {
                  proyectos,
                  brandPartners,
                  sueldos: allSueldos,
                  // The page doesn't pre-load these tables; the exporter
                  // falls back to the scalar precio_mensual /
                  // horas_requeridas_mensual, which on-save is kept in
                  // sync with the per-month grids.
                  honorariosMensuales: [],
                  horasMensuales: [],
                })
              }
              disabled={loading || allAsignaciones.length === 0}
            >
              <FileDown className="w-3.5 h-3.5" />
              Descargar Excel
            </Button>
            {isProyecto ? (
              <Button onClick={() => setAddingOpen(true)} disabled={loading}>
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                Agregar BP
              </Button>
            ) : isBp ? (
              <Button
                onClick={() => setAddingProyectoOpen(true)}
                disabled={loading}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                Agregar proyecto
              </Button>
            ) : null}
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {isAll ? (
        // ============== "All" view: toggle Proyectos / BPs ==============
        <Section
          title={
            allView === 'proyectos'
              ? `Proyectos · ${visibleAllRows.length}`
              : `Brand Partners · ${visibleAllBpRows.length}`
          }
          actions={<AllViewToggle value={allView} onChange={setAllView} />}
          flush
        >
          {loading || !allRows || !allBpRows ? (
            <TableSkeleton rows={8} />
          ) : allView === 'proyectos' ? (
            visibleAllRows.length === 0 ? (
              <EmptyState
                message={
                  allRows.length === 0
                    ? 'Todavía no hay asignaciones cargadas.'
                    : 'Ningún proyecto coincide con la búsqueda.'
                }
              />
            ) : (
              <DataTable
                columns={buildProjectColumns(rentaByProyecto)}
                data={visibleAllRows}
                rowKey={(r) => String(r.proyecto.id)}
                onRowClick={(r) =>
                  setSelectedProyectoId(String(r.proyecto.id))
                }
              />
            )
          ) : visibleAllBpRows.length === 0 ? (
            <EmptyState
              message={
                allBpRows.length === 0
                  ? 'Todavía no hay BPs con asignaciones.'
                  : 'Ningún BP coincide con la búsqueda.'
              }
            />
          ) : (
            <DataTable
              columns={bpColumns}
              data={visibleAllBpRows}
              rowKey={(r) => String(r.bp.id)}
              onRowClick={(r) => setSelectedBpId(String(r.bp.id))}
            />
          )}
        </Section>
      ) : isProyecto ? (
        // ============== Per-project editable grid ==============
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {loading ? (
              <KpiSkeletonGrid count={3} />
            ) : (
              <>
                <KpiCard
                  label="Horas totales (año)"
                  value={formatHours(Math.round(stats.totalHoras))}
                  meta={`sobre ${formatHours(Math.round(stats.availableHoras))} disponibles`}
                />
                <KpiCard
                  label="BPs asignados"
                  value={formatNumber(stats.numBps, 0)}
                  meta={`${bpOrder.length} en la tabla`}
                />
                <KpiCard
                  label="Utilización promedio"
                  value={formatPercent(stats.avgUtilization)}
                />
              </>
            )}
          </div>

          <Section
            title={`BPs asignados${searchQuery ? ` · filtrado` : ''}`}
            flush
          >
            {loading ? (
              <TableSkeleton rows={5} />
            ) : bpOrder.length === 0 ? (
              <EmptyState
                message='Este proyecto no tiene BPs asignados todavía. Usá "Agregar BP" arriba.'
              />
            ) : visibleBpIds.length === 0 ? (
              <EmptyState message="Ningún BP coincide con la búsqueda." />
            ) : (
              <MonthlyEditGrid
                primaryHeader="BP"
                rowIds={visibleBpIds}
                edits={edits}
                initial={initial}
                rowById={(id) => {
                  const bp = brandPartners.find((b) => String(b.id) === id)
                  return bp
                    ? {
                        primary: bp.nombre,
                        secondary: displaySeniority(bp) ?? undefined,
                      }
                    : { primary: 'BP desconocido' }
                }}
                annualHoursForRow={(id) =>
                  annualHoursForBP(
                    brandPartners.find((b) => String(b.id) === id) ?? null,
                    allSueldos,
                    allAsignaciones
                  )
                }
                onCell={setCell}
                onDelete={(id, name, isPersisted) =>
                  setDeletingBp({ bp_id: id, name, isPersisted })
                }
              />
            )}
          </Section>

          {bpOrder.length > 0 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={resetChanges}
                disabled={!dirty || submitting}
                className="mr-auto"
              >
                Deshacer cambios
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={!dirty || submitting}
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </>
      ) : (
        // ============== Per-BP editable grid (rows = projects) ==============
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {loading ? (
              <KpiSkeletonGrid count={3} />
            ) : (
              <>
                <KpiCard
                  label="Horas totales (año)"
                  value={formatHours(Math.round(bpStats.totalHoras))}
                  meta={`sobre ${formatHours(Math.round(bpStats.annualHours))} disponibles`}
                />
                <KpiCard
                  label="Proyectos asignados"
                  value={formatNumber(bpStats.numProyectos, 0)}
                  meta={`${proyectoOrder.length} en la tabla`}
                />
                <KpiCard
                  label="Utilización"
                  value={formatPercent(bpStats.utilization)}
                />
              </>
            )}
          </div>

          <Section
            title={`Proyectos asignados${searchQuery ? ' · filtrado' : ''}`}
            flush
          >
            {loading ? (
              <TableSkeleton rows={5} />
            ) : proyectoOrder.length === 0 ? (
              <EmptyState
                message='Este BP no tiene proyectos asignados todavía. Usá "Agregar proyecto" arriba.'
              />
            ) : visibleProyectoIds.length === 0 ? (
              <EmptyState message="Ningún proyecto coincide con la búsqueda." />
            ) : (
              <MonthlyEditGrid
                primaryHeader="Proyecto"
                rowIds={visibleProyectoIds}
                edits={bpEdits}
                initial={bpInitial}
                rowById={(id) => {
                  const p = proyectos.find((x) => String(x.id) === id)
                  return p
                    ? {
                        primary: p.nombre,
                        secondary: p.tipo ?? undefined,
                      }
                    : { primary: 'Proyecto desconocido' }
                }}
                // BP-view: every row is a project under the same single BP,
                // so each row's denominator is that BP's annual capacity.
                annualHoursForRow={() => bpStats.annualHours}
                onCell={setBpCell}
                onDelete={(id, name, isPersisted) =>
                  setDeletingProyecto({ proyecto_id: id, name, isPersisted })
                }
              />
            )}
          </Section>

          {proyectoOrder.length > 0 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={resetBpChanges}
                disabled={!bpDirty || submitting}
                className="mr-auto"
              >
                Deshacer cambios
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveBp()}
                disabled={!bpDirty || submitting}
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </>
      )}

      <AddBpDialog
        open={addingOpen}
        onOpenChange={setAddingOpen}
        availableBps={availableBps}
        onAdd={handleAddBp}
      />
      <AddProyectoDialog
        open={addingProyectoOpen}
        onOpenChange={setAddingProyectoOpen}
        availableProyectos={availableProyectos}
        onAdd={handleAddProyecto}
      />

      <ConfirmDialog
        open={deletingBp !== null}
        onOpenChange={(o) => !o && setDeletingBp(null)}
        title="Quitar BP del proyecto"
        description={
          deletingBp ? (
            deletingBp.isPersisted ? (
              <>
                Se borran todas las asignaciones de{' '}
                <strong>{deletingBp.name}</strong> en este proyecto. No se
                puede deshacer.
              </>
            ) : (
              <>
                Quitar a <strong>{deletingBp.name}</strong> de la tabla. Como
                todavía no tiene asignaciones guardadas, no toca la base de
                datos.
              </>
            )
          ) : (
            ''
          )
        }
        confirmLabel="Quitar"
        destructive
        onConfirm={handleDeleteBp}
      />

      <ConfirmDialog
        open={deletingProyecto !== null}
        onOpenChange={(o) => !o && setDeletingProyecto(null)}
        title="Quitar proyecto del BP"
        description={
          deletingProyecto ? (
            deletingProyecto.isPersisted ? (
              <>
                Se borran todas las asignaciones de este BP en{' '}
                <strong>{deletingProyecto.name}</strong>. No se puede deshacer.
              </>
            ) : (
              <>
                Quitar <strong>{deletingProyecto.name}</strong> de la tabla.
                Como todavía no tiene asignaciones guardadas, no toca la base
                de datos.
              </>
            )
          ) : (
            ''
          )
        }
        confirmLabel="Quitar"
        destructive
        onConfirm={handleDeleteProyecto}
      />
    </AppLayout>
  )
}

// --------------------------------------------------------------------------
// "All" view columns — one row per project. Click row to drill into the
// per-project editable grid. Columns surface the new profitability model:
// Valor/h proyecto vs Costo/h promedio BPs vs Diferencia, plus a colored
// status badge.
// --------------------------------------------------------------------------

function buildProjectColumns(
  renta: Map<string, ProjectRentabilidadSummary>
): DataTableColumn<ProjectAnnualSummary>[] {
  return [
    {
      key: 'proyecto',
      accessor: 'proyecto',
      header: 'Proyecto',
      render: (_v, row) => (
        <div className="flex flex-col gap-0.5 min-w-[160px]">
          <span className="font-medium whitespace-nowrap">
            {row.proyecto.nombre}
          </span>
          {row.proyecto.tipo && (
            <span className="text-2xs text-tertiary whitespace-nowrap">
              {row.proyecto.tipo}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'uniqueBps',
      accessor: 'uniqueBps',
      header: 'BPs',
      numeric: true,
      render: (v) => formatNumber(v as number, 0),
    },
    {
      key: 'totalHoras',
      accessor: 'totalHoras',
      header: 'Horas año',
      numeric: true,
      render: (v) => formatHours(Math.round(v as number)),
    },
    {
      key: 'valorHora',
      header: 'Valor/h proy.',
      align: 'right',
      numeric: true,
      render: (_v, row) => {
        const r = renta.get(String(row.proyecto.id))
        if (!r || r.valorHora <= 0)
          return <span className="text-tertiary">—</span>
        return formatCurrency(r.valorHora, 2)
      },
    },
    {
      key: 'costoHora',
      header: 'Costo/h BPs',
      align: 'right',
      numeric: true,
      render: (_v, row) => {
        const r = renta.get(String(row.proyecto.id))
        if (!r || r.costoHoraPromedioBps <= 0)
          return <span className="text-tertiary">—</span>
        return formatCurrency(r.costoHoraPromedioBps, 2)
      },
    },
    {
      key: 'diferencia',
      header: 'Diferencia/h',
      align: 'right',
      numeric: true,
      render: (_v, row) => {
        const r = renta.get(String(row.proyecto.id))
        if (!r || r.totalHoras === 0)
          return <span className="text-tertiary">—</span>
        const v = r.diferenciaPorHora
        const color =
          v > 0
            ? 'var(--success)'
            : v < 0
              ? 'var(--danger)'
              : 'var(--text-secondary)'
        const sign = v > 0 ? '+' : v < 0 ? '−' : ''
        return (
          <span style={{ color }}>
            {sign}
            {formatCurrency(Math.abs(v), 2)}
          </span>
        )
      },
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (_v, row) => {
        const r = renta.get(String(row.proyecto.id))
        if (!r || r.totalHoras === 0)
          return <StatusBadge variant="neutral" label="Sin datos" />
        if (r.costoHoraPromedioBps <= 0)
          return <StatusBadge variant="idle" label="Sin costos" />
        return r.rentable ? (
          <StatusBadge variant="active" label="Rentable" />
        ) : (
          <StatusBadge variant="over" label="Pierde" />
        )
      },
    },
  ]
}

const bpColumns: DataTableColumn<BPAnnualSummary>[] = [
  {
    key: 'bp',
    accessor: 'bp',
    header: 'Brand Partner',
    render: (_v, row) => (
      <div className="flex flex-col gap-0.5 min-w-[160px]">
        <span className="font-medium whitespace-nowrap">{row.bp.nombre}</span>
        {displaySeniority(row.bp) && (
          <span className="text-2xs text-tertiary whitespace-nowrap">
            {displaySeniority(row.bp)}
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'uniqueProjects',
    accessor: 'uniqueProjects',
    header: 'Proyectos',
    numeric: true,
    render: (v) => formatNumber(v as number, 0),
  },
  {
    key: 'totalHoras',
    accessor: 'totalHoras',
    header: 'Horas año',
    numeric: true,
    render: (v) => formatHours(Math.round(v as number)),
  },
  {
    key: 'avgUtilization',
    accessor: 'avgUtilization',
    header: 'Util. prom.',
    numeric: true,
    render: (v) => {
      const value = v as number
      const color =
        value > 100
          ? 'var(--danger)'
          : value >= 80
            ? 'var(--success)'
            : value > 0
              ? 'var(--warning)'
              : 'var(--text-tertiary)'
      return <span style={{ color }}>{formatPercent(value)}</span>
    },
  },
  {
    key: 'totalSueldo',
    accessor: 'totalSueldo',
    header: 'Sueldo año',
    numeric: true,
    render: (v) =>
      (v as number) > 0 ? formatCurrency(v as number) : '—',
  },
]

// --------------------------------------------------------------------------
// Toggle Proyectos / BPs in the all view
// --------------------------------------------------------------------------

function AllViewToggle({
  value,
  onChange,
}: {
  value: 'proyectos' | 'bps'
  onChange: (v: 'proyectos' | 'bps') => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Vista"
      className="inline-flex p-0.5 rounded-md border border-border bg-base text-sm"
    >
      {(['proyectos', 'bps'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'px-3 py-1 rounded text-2xs font-medium uppercase tracking-wider transition-colors',
            value === v
              ? 'bg-surface text-primary shadow-sm'
              : 'text-tertiary hover:text-primary'
          )}
        >
          {v === 'proyectos' ? 'Por proyecto' : 'Por BP'}
        </button>
      ))}
    </div>
  )
}

// --------------------------------------------------------------------------
// Generic editable monthly grid — used by both project mode (rows = BPs)
// and BP mode (rows = projects). The row label resolver decouples the
// grid from the entity kind.
// --------------------------------------------------------------------------

interface MonthlyEditGridProps {
  primaryHeader: string
  rowIds: string[]
  edits: EditState
  initial: EditState
  rowById: (id: string) => { primary: string; secondary?: string }
  onCell: (id: string, monthIdx: number, raw: string) => void
  onDelete: (id: string, name: string, isPersisted: boolean) => void
  /** Annual capacity for a row's utilization denominator. Project-mode
   *  callers pass `(bp_id) => annualHoursForBP(bp)`; BP-mode callers
   *  return the page's single BP's annual hours for every row. Falls
   *  back to 12 × 160 if omitted. */
  annualHoursForRow?: (id: string) => number
}

function MonthlyEditGrid({
  primaryHeader,
  rowIds,
  edits,
  initial,
  rowById,
  onCell,
  onDelete,
  annualHoursForRow,
}: MonthlyEditGridProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xl">
        <thead>
          <tr>
            <Th sticky>{primaryHeader}</Th>
            {MONTHS.map((m) => (
              <Th key={m} numeric compact>
                {getMonthLabel(m).slice(0, 3)}
              </Th>
            ))}
            <Th numeric>Total</Th>
            <Th numeric>Util.</Th>
            <Th align="right">{''}</Th>
          </tr>
        </thead>
        <tbody>
          {rowIds.map((id) => {
            const info = rowById(id)
            const values = edits[id] ?? new Array(12).fill(0)
            const isPersisted = Boolean(initial[id])
            const total = values.reduce((s, x) => s + x, 0)
            const annualCap = annualHoursForRow
              ? annualHoursForRow(id)
              : HOURS_PER_MONTH * 12
            const util = annualCap === 0 ? 0 : (total / annualCap) * 100
            return (
              <tr key={id} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-base px-3 py-3 align-middle border-r border-border">
                  <div className="flex flex-col gap-0.5 min-w-[160px]">
                    <span className="font-medium whitespace-nowrap text-lg text-primary">
                      {info.primary}
                    </span>
                    {info.secondary && (
                      <span className="text-sm text-tertiary whitespace-nowrap">
                        {info.secondary}
                      </span>
                    )}
                    {!isPersisted && (
                      <span className="text-sm text-accent">Sin guardar</span>
                    )}
                  </div>
                </td>
                {MONTHS.map((m, i) => {
                  const initVal = initial[id]?.[i]
                  const changed = initVal !== undefined && initVal !== values[i]
                  return (
                    <td
                      key={m}
                      className={cn(
                        'px-1 py-1 align-middle',
                        changed && 'bg-accent-soft/40'
                      )}
                    >
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.5"
                        value={values[i] ?? 0}
                        onChange={(e) => onCell(id, i, e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        className={cn(
                          'w-[80px] h-11 px-2 rounded-sm border border-transparent bg-transparent',
                          'text-lg text-primary text-right font-mono tabular-nums',
                          'hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:border-accent'
                        )}
                      />
                    </td>
                  )
                })}
                <td className="px-3 py-3 align-middle text-right font-mono tabular-nums text-xl">
                  {formatHours(Math.round(total))}
                </td>
                <td className="px-3 py-3 align-middle text-right font-mono tabular-nums text-xl">
                  <span
                    style={{
                      color:
                        util > 100
                          ? 'var(--danger)'
                          : util >= 80
                            ? 'var(--success)'
                            : util > 0
                              ? 'var(--warning)'
                              : 'var(--text-tertiary)',
                    }}
                  >
                    {formatNumber(util, 1)}%
                  </span>
                </td>
                <td className="px-3 py-2 align-middle text-right">
                  <button
                    type="button"
                    aria-label="Quitar"
                    title="Quitar"
                    onClick={() => onDelete(id, info.primary, isPersisted)}
                    className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
        compact ? 'px-2 py-2 text-2xs' : 'px-3 py-2 text-xs',
        numeric || align === 'right' ? 'text-right' : 'text-left',
        sticky && 'sticky left-0 z-20 border-r border-border'
      )}
    >
      {children}
    </th>
  )
}

// --------------------------------------------------------------------------

interface AddBpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableBps: BrandPartner[]
  onAdd: (bp_id: string) => void
}

function AddBpDialog({
  open,
  onOpenChange,
  availableBps,
  onAdd,
}: AddBpDialogProps) {
  const [bpId, setBpId] = useState('')

  useEffect(() => {
    if (open) setBpId('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar BP al proyecto</DialogTitle>
          <DialogDescription>
            El BP se agrega con 0 horas en los 12 meses; editá los valores y
            guardá los cambios para persistir.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {availableBps.length === 0 ? (
            <EmptyState message="Todos los BPs ya están asignados a este proyecto." />
          ) : (
            <Field id="add-bp-select" label="Brand Partner" required>
              <Select
                id="add-bp-select"
                value={bpId}
                onChange={(e) => setBpId(e.target.value)}
              >
                <option value="" disabled>
                  Elegí un BP…
                </option>
                {availableBps.map((bp) => {
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
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!bpId}
            onClick={() => {
              onAdd(bpId)
              onOpenChange(false)
            }}
          >
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------------------

interface AddProyectoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableProyectos: Proyecto[]
  onAdd: (proyecto_id: string) => void
}

function AddProyectoDialog({
  open,
  onOpenChange,
  availableProyectos,
  onAdd,
}: AddProyectoDialogProps) {
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (open) setProyectoId('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar proyecto al BP</DialogTitle>
          <DialogDescription>
            El proyecto se agrega con 0 horas en los 12 meses; editá los
            valores y guardá los cambios para persistir.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {availableProyectos.length === 0 ? (
            <EmptyState message="Este BP ya está asignado a todos los proyectos." />
          ) : (
            <Field id="add-proy-select" label="Proyecto" required>
              <Select
                id="add-proy-select"
                value={proyectoId}
                onChange={(e) => setProyectoId(e.target.value)}
              >
                <option value="" disabled>
                  Elegí un proyecto…
                </option>
                {availableProyectos.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {p.nombre}
                    {p.tipo ? ` · ${p.tipo}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!proyectoId}
            onClick={() => {
              onAdd(proyectoId)
              onOpenChange(false)
            }}
          >
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
