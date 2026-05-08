import { supabase } from './supabase'
import {
  buildBPsForProject,
  buildProjectsForBp,
  calculateBPSummary,
  type BPProjectBreakdown,
  type ProjectBPBreakdown,
} from './calculations'

// ----- DB row types -------------------------------------------------------
//
// IDs are typed as `string | number` because we don't know whether each
// table uses uuid or bigint — call sites should compare with `String(x)`.

export type Id = string | number

export interface Proyecto {
  id: Id
  nombre: string
  tipo: string | null
  /** Legacy scalar — kept in sync with `precio_mensual` from new forms. */
  honorarios_cotizador: number
  /** New profitability model: monthly price for the project. */
  precio_mensual: number | null
  /** New profitability model: monthly hours the project requires. */
  horas_requeridas_mensual: number | null
  fecha_inicio: string | null
  fecha_renovacion: string | null
  status: string | null
  description: string | null
}

export interface BrandPartner {
  id: Id
  nombre: string
  seniority: string | null
  /** FK to `groupers.id`. Nullable when no grouper assigned. */
  grouper_id: string | null
  /** Joined `groupers.nombre` — populated by reads that select the relation. */
  grouper: string | null
  /** New profitability model: BP's monthly salary baseline. */
  sueldo_mensual: number | null
  /** New profitability model: hours the BP can work per month (default 160). */
  capacidad_horas_mensual: number | null
  /** True = currently working with us. False = inactive. Null treated as true. */
  activo: boolean | null
  created_at: string
}

export interface Asignacion {
  id: Id
  bp_id: Id
  proyecto_id: Id
  mes: number
  horas: number
  created_at: string
}

export interface Sueldo {
  id: Id
  bp_id: Id
  mes: number
  sueldo: number
  created_at: string
}

// ----- helpers ------------------------------------------------------------

function logQueryError(label: string, error: unknown): void {
  // Don't crash callers — just log and let them render an empty state.
  console.error(`[queries] ${label} failed:`, error)
}

// ----- queries ------------------------------------------------------------

export interface GetProyectosOptions {
  /** If passed, filters by exact `status` (e.g. 'activo'). */
  status?: string
}

export async function getProyectos(opts: GetProyectosOptions = {}): Promise<Proyecto[]> {
  let q = supabase.from('proyectos').select('*').order('nombre', { ascending: true })
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) {
    logQueryError('getProyectos', error)
    return []
  }
  return (data ?? []) as Proyecto[]
}

export async function getBrandPartners(): Promise<BrandPartner[]> {
  const { data, error } = await supabase
    .from('brand_partners')
    .select('*, grouper_rel:groupers(nombre)')
    .order('nombre', { ascending: true })
  if (error) {
    logQueryError('getBrandPartners', error)
    return []
  }
  return (data ?? []).map(flattenGrouper) as unknown as BrandPartner[]
}

/**
 * Postgres returns the joined `groupers` row as `grouper_rel: { nombre }`
 * (or null). Pull `nombre` up to `grouper` so the rest of the app can keep
 * reading `bp.grouper` as a flat string. `grouper_id` is already on the row.
 */
function flattenGrouper(row: Record<string, unknown>): Record<string, unknown> {
  const rel = row['grouper_rel'] as { nombre?: string } | null | undefined
  const { grouper_rel: _gr, ...rest } = row as { grouper_rel?: unknown }
  void _gr
  return { ...rest, grouper: rel?.nombre ?? null }
}

export async function getAsignaciones(mes?: number): Promise<Asignacion[]> {
  let q = supabase.from('asignaciones').select('*')
  if (typeof mes === 'number') q = q.eq('mes', mes)
  const { data, error } = await q
  if (error) {
    logQueryError('getAsignaciones', error)
    return []
  }
  return (data ?? []) as Asignacion[]
}

export async function getSueldos(mes?: number): Promise<Sueldo[]> {
  let q = supabase.from('sueldos').select('*')
  if (typeof mes === 'number') q = q.eq('mes', mes)
  const { data, error } = await q
  if (error) {
    logQueryError('getSueldos', error)
    return []
  }
  return (data ?? []) as Sueldo[]
}

/**
 * Single-BP sueldo lookup. If `mes` is provided returns that month, else
 * returns the most-recent sueldo on file. Returns null when nothing is
 * found or on error.
 */
export async function getSueldoBP(
  bp_id: Id,
  mes?: number
): Promise<Sueldo | null> {
  let q = supabase.from('sueldos').select('*').eq('bp_id', bp_id)
  if (typeof mes === 'number') {
    q = q.eq('mes', mes).limit(1)
  } else {
    q = q.order('mes', { ascending: false }).limit(1)
  }
  const { data, error } = await q.maybeSingle<Sueldo>()
  if (error) {
    logQueryError('getSueldoBP', error)
    return null
  }
  return data ?? null
}

/**
 * Convenience: fetches everything the dashboard needs for a single month
 * in parallel. Each individual query swallows its own error so we always
 * get a usable shape back; the boolean flags tell the caller which
 * datasets were empty due to an actual fetch error vs. just having no
 * rows in the DB.
 */
export interface DashboardSnapshot {
  proyectos: Proyecto[]
  brandPartners: BrandPartner[]
  asignaciones: Asignacion[]
  sueldos: Sueldo[]
  /** Per-project per-month booked honorarios. Used for "billed revenue"
   * KPIs, independent of whether anyone actually worked the hours. */
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[]
}

export async function getDashboardSnapshot(mes: number): Promise<DashboardSnapshot> {
  const [proyectos, brandPartners, asignaciones, sueldos, honorariosMensuales] =
    await Promise.all([
      getProyectos(),
      getBrandPartners(),
      getAsignaciones(mes),
      getSueldos(mes),
      getProyectoHonorariosMensualesAll(),
    ])
  return { proyectos, brandPartners, asignaciones, sueldos, honorariosMensuales }
}

/** Fetches every row from `proyecto_honorarios_mensuales` in one call.
 * Used by the dashboards to compute booked revenue. */
async function getProyectoHonorariosMensualesAll(): Promise<
  { proyecto_id: Id; mes: number; honorarios: number }[]
> {
  const { data, error } = await supabase
    .from('proyecto_honorarios_mensuales')
    .select('proyecto_id, mes, honorarios')
  if (error) {
    logQueryError('getProyectoHonorariosMensualesAll', error)
    return []
  }
  return (data ?? []) as { proyecto_id: Id; mes: number; honorarios: number }[]
}

// ----- additional helpers -------------------------------------------------

/** 160 working hours per month — used by util/utilization helpers below. */
const HOURS_PER_MONTH = 160

/** Total count of brand_partners. Returns 0 on error. */
export async function getTotalBPs(): Promise<number> {
  const { count, error } = await supabase
    .from('brand_partners')
    .select('*', { count: 'exact', head: true })
  if (error) {
    logQueryError('getTotalBPs', error)
    return 0
  }
  return count ?? 0
}

/**
 * Average sueldo across rows in `sueldos`. With `mes` provided, restricted
 * to that month; otherwise across all rows on file.
 */
export async function getAverageSalary(mes?: number): Promise<number> {
  const sueldos = await getSueldos(mes)
  if (sueldos.length === 0) return 0
  const total = sueldos.reduce((s, x) => s + Number(x.sueldo), 0)
  return total / sueldos.length
}

/**
 * Average BP utilization (%): for each BP we compute hoursUsed / 160, then
 * average across all BPs (BPs with no assignments contribute 0).
 */
export async function getAverageUtilization(mes?: number): Promise<number> {
  const [bps, asignaciones] = await Promise.all([
    getBrandPartners(),
    getAsignaciones(mes),
  ])
  if (bps.length === 0) return 0
  const usedByBp = new Map<string, number>()
  for (const a of asignaciones) {
    const k = String(a.bp_id)
    usedByBp.set(k, (usedByBp.get(k) ?? 0) + Number(a.horas))
  }
  const total = bps.reduce((acc, bp) => {
    const used = usedByBp.get(String(bp.id)) ?? 0
    return acc + (used / HOURS_PER_MONTH) * 100
  }, 0)
  return total / bps.length
}

/** BPs that have no asignacion in the given month. */
export async function getBPsWithoutAssignments(mes?: number): Promise<BrandPartner[]> {
  const [bps, asignaciones] = await Promise.all([
    getBrandPartners(),
    getAsignaciones(mes),
  ])
  const assigned = new Set(asignaciones.map((a) => String(a.bp_id)))
  return bps.filter((bp) => !assigned.has(String(bp.id)))
}

export async function getAsignacionesByProyecto(
  proyecto_id: Id,
  mes?: number
): Promise<Asignacion[]> {
  let q = supabase.from('asignaciones').select('*').eq('proyecto_id', proyecto_id)
  if (typeof mes === 'number') q = q.eq('mes', mes)
  const { data, error } = await q
  if (error) {
    logQueryError('getAsignacionesByProyecto', error)
    return []
  }
  return (data ?? []) as Asignacion[]
}

/** Full sueldo history for a single BP, ordered by mes ascending. */
export async function getSalaryHistory(bp_id: Id): Promise<Sueldo[]> {
  const { data, error } = await supabase
    .from('sueldos')
    .select('*')
    .eq('bp_id', bp_id)
    .order('mes', { ascending: true })
  if (error) {
    logQueryError('getSalaryHistory', error)
    return []
  }
  return (data ?? []) as Sueldo[]
}

// ----- horas_contratadas (per-project per-month contracted hours) ---------

export interface HorasContratadas {
  id: Id
  proyecto_id: Id
  mes: number
  horas: number
  created_at: string
}

export async function getHorasContratadas(
  proyecto_id?: Id,
  mes?: number
): Promise<HorasContratadas[]> {
  let q = supabase.from('horas_contratadas').select('*')
  if (proyecto_id !== undefined) q = q.eq('proyecto_id', proyecto_id)
  if (typeof mes === 'number') q = q.eq('mes', mes)
  const { data, error } = await q
  if (error) {
    logQueryError('getHorasContratadas', error)
    return []
  }
  return (data ?? []) as HorasContratadas[]
}

// ----- annual snapshot ---------------------------------------------------

export interface AnnualSnapshot {
  proyectos: Proyecto[]
  brandPartners: BrandPartner[]
  asignaciones: Asignacion[]
  sueldos: Sueldo[]
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[]
}

/** Same shape as DashboardSnapshot but with no `mes` filter — all months. */
export async function getAnnualSnapshot(): Promise<AnnualSnapshot> {
  const [proyectos, brandPartners, asignaciones, sueldos, honorariosMensuales] =
    await Promise.all([
      getProyectos(),
      getBrandPartners(),
      getAsignaciones(),
      getSueldos(),
      getProyectoHonorariosMensualesAll(),
    ])
  return { proyectos, brandPartners, asignaciones, sueldos, honorariosMensuales }
}

export interface ProjectDetailData {
  proyecto: Proyecto | null
  asignaciones: Asignacion[]
  sueldos: Sueldo[]
  horasContratadas: HorasContratadas[]
  brandPartners: BrandPartner[]
}

/** Everything we need to render the project detail modal. */
export async function getProjectDetail(proyecto_id: Id): Promise<ProjectDetailData> {
  const [proyecto, asignaciones, sueldos, horasContratadas, brandPartners] =
    await Promise.all([
      (async () => {
        const { data, error } = await supabase
          .from('proyectos')
          .select('*')
          .eq('id', proyecto_id)
          .maybeSingle<Proyecto>()
        if (error) {
          logQueryError('getProjectDetail.proyecto', error)
          return null
        }
        return data ?? null
      })(),
      getAsignacionesByProyecto(proyecto_id),
      getSueldos(),
      getHorasContratadas(proyecto_id),
      getBrandPartners(),
    ])
  return { proyecto, asignaciones, sueldos, horasContratadas, brandPartners }
}

export interface BPDetailData {
  bp: BrandPartner | null
  asignaciones: Asignacion[]
  sueldos: Sueldo[]
  proyectos: Proyecto[]
}

// ----- full detail (used by the rich detail modals) ----------------------

export interface ProjectDetailFull {
  proyecto: Proyecto | null
  /** Yearly aggregates. */
  totalHoras: number
  totalRevenue: number
  totalCost: number
  marginPercent: number
  /** One row per BP that worked on the project — hours by month + % share. */
  bps: ProjectBPBreakdown[]
}

export async function getProjectDetailFull(
  proyecto_id: Id
): Promise<ProjectDetailFull> {
  const detail = await getProjectDetail(proyecto_id)
  const proyecto = detail.proyecto
  if (!proyecto) {
    return {
      proyecto: null,
      totalHoras: 0,
      totalRevenue: 0,
      totalCost: 0,
      marginPercent: 0,
      bps: [],
    }
  }
  const bps = buildBPsForProject(
    proyecto,
    detail.asignaciones,
    detail.brandPartners,
    detail.sueldos
  )
  const totalHoras = bps.reduce((s, x) => s + x.totalHoras, 0)
  const ratePerHour = Number(proyecto.honorarios_cotizador) / 160
  const totalRevenue = totalHoras * ratePerHour
  // Cost = sum of full sueldos for any BP that touched the project (per spec
  // for project margin in earlier phases — caveat: overstates if a BP also
  // works on other projects).
  const totalCost = bps.reduce((s, x) => s + x.totalSueldo, 0)
  const marginPercent = totalRevenue > 0
    ? ((totalRevenue - totalCost) / totalRevenue) * 100
    : 0
  return {
    proyecto,
    totalHoras,
    totalRevenue,
    totalCost,
    marginPercent,
    bps,
  }
}

export interface BPDetailFull {
  bp: BrandPartner | null
  /** Sum of hours this BP logged across the year. */
  totalHoras: number
  /** Sum of all sueldo rows on file for this BP. */
  totalSueldo: number
  /** Mean utilization across the 12 months (%). */
  avgUtilization: number
  /** Per-project rows: hours by month + % share of the BP's total hours. */
  proyectos: BPProjectBreakdown[]
}

export async function getBPDetailFull(bp_id: Id): Promise<BPDetailFull> {
  const detail = await getBPDetail(bp_id)
  const bp = detail.bp
  if (!bp) {
    return {
      bp: null,
      totalHoras: 0,
      totalSueldo: 0,
      avgUtilization: 0,
      proyectos: [],
    }
  }
  const proyectos = buildProjectsForBp(bp, detail.asignaciones, detail.proyectos)
  const totalHoras = proyectos.reduce((s, x) => s + x.totalHoras, 0)
  const totalSueldo = detail.sueldos.reduce(
    (s, x) => s + Number(x.sueldo),
    0
  )
  // Compute monthly utilization mean (0..n).
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const summaries = months.map((m) =>
    calculateBPSummary(bp, detail.asignaciones, detail.sueldos, m)
  )
  const avgUtilization =
    summaries.reduce((s, x) => s + x.utilization, 0) / summaries.length
  return {
    bp,
    totalHoras,
    totalSueldo,
    avgUtilization,
    proyectos,
  }
}

export async function getBPDetail(bp_id: Id): Promise<BPDetailData> {
  const [bp, asignaciones, sueldos, proyectos] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from('brand_partners')
        .select('*, grouper_rel:groupers(nombre)')
        .eq('id', bp_id)
        .maybeSingle()
      if (error) {
        logQueryError('getBPDetail.bp', error)
        return null
      }
      return data ? (flattenGrouper(data) as unknown as BrandPartner) : null
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('asignaciones')
        .select('*')
        .eq('bp_id', bp_id)
      if (error) {
        logQueryError('getBPDetail.asignaciones', error)
        return [] as Asignacion[]
      }
      return (data ?? []) as Asignacion[]
    })(),
    getSalaryHistory(bp_id),
    getProyectos(),
  ])
  return { bp, asignaciones, sueldos, proyectos }
}

// ----- mutations ----------------------------------------------------------

export type CreateResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface NewProyectoData {
  nombre: string
  tipo: string | null
  /** Kept in sync with precio_mensual for legacy compatibility. */
  honorarios_cotizador: number
  precio_mensual?: number | null
  horas_requeridas_mensual?: number | null
  fecha_inicio: string | null
  status: string
  description?: string | null
  /** Optional length-12 array of per-month honorarios. When provided, seeds
   * `proyecto_honorarios_mensuales` with these specific values instead of
   * 12 copies of `honorarios_cotizador`. */
  honorarios_por_mes?: number[]
}

export interface ProyectoHonorarioMensual {
  id: Id
  proyecto_id: Id
  mes: number
  honorarios: number
  created_at?: string
}

export interface NewBrandPartnerData {
  nombre: string
  /** Derived from sueldo (no longer a manual input). Nullable when
   * the BP is created without a sueldo loaded. */
  seniority?: string | null
  /** FK to `groupers.id`. Null = no grouper assigned. */
  grouper_id?: string | null
  sueldo_mensual?: number | null
  capacidad_horas_mensual?: number | null
  activo?: boolean
  /** Legacy: if > 0 and no `sueldos_por_mes` is given, seeds 12 sueldo
   * rows all with this value. Superseded by `sueldos_por_mes`. */
  sueldo_base?: number
  /** Length-12 array of per-month sueldos. When provided, seeds the
   * `sueldos` table with these specific values (one row per month). */
  sueldos_por_mes?: number[]
}

export interface NewAsignacionData {
  bp_id: Id
  proyecto_id: Id
  mes: number
  horas: number
  /** When true, generates 12 rows ignoring `mes`. */
  applyToAllMonths?: boolean
}

export interface NewSueldoData {
  bp_id: Id
  mes: number
  sueldo: number
  /** When true, generates 12 rows ignoring `mes`. */
  applyToAllMonths?: boolean
}

async function insert<T>(
  table: string,
  payload: object,
  label: string
): Promise<CreateResult<T>> {
  const { data, error } = await supabase
    .from(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(payload as any)
    .select()
    .single()
  if (error) {
    logQueryError(label, error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data as T }
}

async function insertMany<T>(
  table: string,
  rows: object[],
  label: string
): Promise<CreateResult<T[]>> {
  const { data, error } = await supabase
    .from(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(rows as any)
    .select()
  if (error) {
    logQueryError(label, error)
    return { success: false, error: error.message }
  }
  return { success: true, data: (data ?? []) as T[] }
}

const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * Create a project, then seed 12 rows in `proyecto_honorarios_mensuales`.
 * If `honorarios_por_mes` is provided (length 12), each month gets its
 * specific value; otherwise all 12 months are seeded with
 * `honorarios_cotizador` (legacy behavior). Seed step is best-effort:
 * if it fails, the proyecto still exists and the caller sees a
 * partial-success message in the toast.
 */
export async function createProyecto(
  data: NewProyectoData
): Promise<CreateResult<Proyecto>> {
  // Don't send the per-month array to the proyectos insert — it's not a
  // column on that table.
  const { honorarios_por_mes, ...payload } = data
  const main = await insert<Proyecto>('proyectos', payload, 'createProyecto')
  if (!main.success) return main

  const fallback = Math.max(0, Number(data.honorarios_cotizador) || 0)
  const rows = ALL_MONTHS.map((mes, i) => ({
    proyecto_id: main.data.id,
    mes,
    honorarios:
      honorarios_por_mes && honorarios_por_mes[i] != null
        ? Math.max(0, Number(honorarios_por_mes[i]) || 0)
        : fallback,
  }))
  const seed = await insertMany<ProyectoHonorarioMensual>(
    'proyecto_honorarios_mensuales',
    rows,
    'createProyecto.honorarios_mensuales'
  )
  if (!seed.success) {
    return {
      success: false,
      error: `Proyecto creado, pero los honorarios mensuales no se cargaron: ${seed.error}`,
    }
  }
  return main
}

/**
 * Create a BP, then optionally seed 12 sueldo rows. Two paths:
 *  - `sueldos_por_mes` (length 12): seeds each month with its specific
 *    value. Months with 0 still get a row.
 *  - `sueldo_base` (legacy): seeds all 12 with the same value.
 * If both are given, `sueldos_por_mes` wins. If neither, no seed.
 */
export async function createBrandPartner(
  data: NewBrandPartnerData
): Promise<CreateResult<BrandPartner>> {
  const { sueldo_base, sueldos_por_mes, ...payload } = data
  const main = await insert<BrandPartner>(
    'brand_partners',
    payload,
    'createBrandPartner'
  )
  if (!main.success) return main

  // Decide which seed path (if any).
  let rows: { bp_id: Id; mes: number; sueldo: number }[] | null = null
  if (sueldos_por_mes && sueldos_por_mes.length === 12) {
    rows = ALL_MONTHS.map((mes, i) => ({
      bp_id: main.data.id,
      mes,
      sueldo: Math.max(0, Number(sueldos_por_mes[i]) || 0),
    }))
  } else if (sueldo_base !== undefined && sueldo_base > 0) {
    rows = ALL_MONTHS.map((mes) => ({
      bp_id: main.data.id,
      mes,
      sueldo: sueldo_base,
    }))
  }

  if (rows) {
    const seed = await insertMany<Sueldo>('sueldos', rows, 'createBrandPartner.sueldos')
    if (!seed.success) {
      return {
        success: false,
        error: `BP creado, pero los sueldos no se cargaron: ${seed.error}`,
      }
    }
  }
  return main
}

export async function createAsignacion(
  data: NewAsignacionData
): Promise<CreateResult<Asignacion | Asignacion[]>> {
  const { applyToAllMonths, mes, ...rest } = data
  if (applyToAllMonths) {
    const rows = ALL_MONTHS.map((m) => ({ ...rest, mes: m }))
    return insertMany<Asignacion>('asignaciones', rows, 'createAsignacion(all)')
  }
  return insert<Asignacion>(
    'asignaciones',
    { ...rest, mes },
    'createAsignacion'
  )
}

export async function createSueldo(
  data: NewSueldoData
): Promise<CreateResult<Sueldo | Sueldo[]>> {
  const { applyToAllMonths, mes, ...rest } = data
  if (applyToAllMonths) {
    const rows = ALL_MONTHS.map((m) => ({ ...rest, mes: m }))
    return insertMany<Sueldo>('sueldos', rows, 'createSueldo(all)')
  }
  return insert<Sueldo>('sueldos', { ...rest, mes }, 'createSueldo')
}

// ----- updates ------------------------------------------------------------

export interface UpdateProyectoData {
  nombre?: string
  tipo?: string | null
  honorarios_cotizador?: number
  precio_mensual?: number | null
  horas_requeridas_mensual?: number | null
  fecha_inicio?: string | null
  fecha_renovacion?: string | null
  status?: string
  description?: string | null
}

export interface UpdateBrandPartnerData {
  nombre?: string
  seniority?: string | null
  grouper_id?: string | null
  sueldo_mensual?: number | null
  capacidad_horas_mensual?: number | null
  activo?: boolean
}

async function updateRow<T>(
  table: string,
  id: Id,
  patch: object,
  label: string
): Promise<CreateResult<T>> {
  const { data, error } = await supabase
    .from(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    logQueryError(label, error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data as T }
}

export function updateProyecto(id: Id, patch: UpdateProyectoData) {
  return updateRow<Proyecto>('proyectos', id, patch, 'updateProyecto')
}

export function updateBrandPartner(id: Id, patch: UpdateBrandPartnerData) {
  return updateRow<BrandPartner>(
    'brand_partners',
    id,
    patch,
    'updateBrandPartner'
  )
}

// ----- deletes ------------------------------------------------------------

export type DeleteResult =
  | { success: true }
  | { success: false; error: string }

async function deleteRow(
  table: string,
  id: Id,
  label: string
): Promise<DeleteResult> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) {
    logQueryError(label, error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

/**
 * Deletes a project. Dependent rows (asignaciones, proyecto_honorarios_mensuales)
 * are expected to cascade via FK constraints. If they don't, Postgres returns
 * a foreign-key violation that bubbles up as the error message.
 */
export function deleteProyecto(id: Id): Promise<DeleteResult> {
  return deleteRow('proyectos', id, 'deleteProyecto')
}

/**
 * Deletes a Brand Partner. Same cascade caveat as deleteProyecto.
 */
export function deleteBrandPartner(id: Id): Promise<DeleteResult> {
  return deleteRow('brand_partners', id, 'deleteBrandPartner')
}

// ----- groupers (canonical list used in BP form dropdowns) --------------

export interface Grouper {
  id: string
  nombre: string
  created_at: string
}

export async function getGroupers(): Promise<Grouper[]> {
  const { data, error } = await supabase
    .from('groupers')
    .select('*')
    .order('nombre', { ascending: true })
  if (error) {
    logQueryError('getGroupers', error)
    return []
  }
  return (data ?? []) as Grouper[]
}

export async function createGrouper(nombre: string): Promise<CreateResult<Grouper>> {
  const trimmed = nombre.trim()
  if (!trimmed) return { success: false, error: 'Nombre vacío' }
  const { data, error } = await supabase
    .from('groupers')
    .insert({ nombre: trimmed })
    .select()
    .single()
  if (error) {
    logQueryError('createGrouper', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data as Grouper }
}

export function deleteGrouper(id: string): Promise<DeleteResult> {
  return deleteRow('groupers', id, 'deleteGrouper')
}

export async function updateGrouper(
  id: string,
  nombre: string
): Promise<CreateResult<Grouper>> {
  const trimmed = nombre.trim()
  if (!trimmed) return { success: false, error: 'Nombre vacío' }
  const { data, error } = await supabase
    .from('groupers')
    .update({ nombre: trimmed })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    logQueryError('updateGrouper', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data as Grouper }
}

// ----- allowlist (admin-managed list, no longer gates auth) -------------
//
// The auth flow no longer enforces this list — any successful Google
// sign-in is accepted. The CRUD helpers below are kept solely so the
// admin panel (`/admin/usuarios`) keeps working as a manual record of
// approved users. If you decide the panel is dead weight, remove these
// helpers, the admin page, and the sidebar link in one pass.

export interface AllowedEmail {
  id: string
  email: string
  created_at: string
}

/** List all allowed emails (admin-only via RLS, but anyone authenticated can read). */
export async function getAllowedEmails(): Promise<AllowedEmail[]> {
  const { data, error } = await supabase
    .from('allowed_emails')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    logQueryError('getAllowedEmails', error)
    return []
  }
  return (data ?? []) as AllowedEmail[]
}

/**
 * Inserts a new allowed email. RLS in Postgres requires the caller to be
 * the admin email. The email is normalized to lowercase before insert.
 * Returns `success: false` on duplicate / permission errors.
 */
export async function addAllowedEmail(email: string): Promise<CreateResult<AllowedEmail>> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return { success: false, error: 'Email vacío' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { success: false, error: 'Formato de email inválido' }
  }
  const { data, error } = await supabase
    .from('allowed_emails')
    .insert({ email: normalized })
    .select()
    .single()
  if (error) {
    logQueryError('addAllowedEmail', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data as AllowedEmail }
}

export function deleteAllowedEmail(id: string): Promise<DeleteResult> {
  return deleteRow('allowed_emails', id, 'deleteAllowedEmail')
}

// ----- per-project asignaciones (full year, by BP) -----------------------

export interface ProjectAsignacionRow {
  bp: BrandPartner | null
  bp_id: string
  bp_name: string
  /** Length-12 array; index i = month (i+1). 0 for months without a row. */
  horas_por_mes: number[]
  /** Sum of horas across the year. */
  totalHoras: number
}

export interface ProjectAsignacionesFullYear {
  proyecto: Proyecto | null
  rows: ProjectAsignacionRow[]
}

/**
 * For a given project: every BP that has at least one asignacion, with a
 * 12-slot array of monthly hours. Sorted by total hours descending.
 */
export async function getProjectAsignacionesFullYear(
  proyecto_id: Id
): Promise<ProjectAsignacionesFullYear> {
  const [proyectoRes, asignaciones, brandPartners] = await Promise.all([
    supabase
      .from('proyectos')
      .select('*')
      .eq('id', proyecto_id)
      .maybeSingle<Proyecto>(),
    getAsignacionesByProyecto(proyecto_id),
    getBrandPartners(),
  ])
  if (proyectoRes.error) {
    logQueryError('getProjectAsignacionesFullYear.proyecto', proyectoRes.error)
  }
  const proyecto = proyectoRes.data ?? null
  const bpMap = new Map(brandPartners.map((b) => [String(b.id), b]))
  // Group asignaciones by bp_id, building a 12-slot array per BP.
  const byBp = new Map<string, number[]>()
  for (const a of asignaciones) {
    const k = String(a.bp_id)
    let arr = byBp.get(k)
    if (!arr) {
      arr = new Array(12).fill(0)
      byBp.set(k, arr)
    }
    if (a.mes >= 1 && a.mes <= 12) arr[a.mes - 1] += Number(a.horas) || 0
  }
  const rows: ProjectAsignacionRow[] = []
  for (const [bp_id, horas_por_mes] of byBp.entries()) {
    const bp = bpMap.get(bp_id) ?? null
    rows.push({
      bp,
      bp_id,
      bp_name: bp?.nombre ?? 'BP desconocido',
      horas_por_mes,
      totalHoras: horas_por_mes.reduce((s, x) => s + x, 0),
    })
  }
  rows.sort((a, b) => b.totalHoras - a.totalHoras)
  return { proyecto, rows }
}

/**
 * Upserts up to 12 asignaciones for a given (proyecto_id, bp_id) tuple.
 * Requires a UNIQUE constraint on (proyecto_id, bp_id, mes) — without it,
 * the call errors out with the underlying Postgres message.
 */
export async function updateAsignacionFullYear(
  proyecto_id: Id,
  bp_id: Id,
  horas_por_mes: { mes: number; horas: number }[]
): Promise<CreateResult<Asignacion[]>> {
  const rows = horas_por_mes.map((h) => ({
    proyecto_id,
    bp_id,
    mes: h.mes,
    horas: Math.max(0, Number(h.horas) || 0),
  }))
  const { data, error } = await supabase
    .from('asignaciones')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: 'proyecto_id,bp_id,mes' })
    .select()
  if (error) {
    logQueryError('updateAsignacionFullYear', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: (data ?? []) as Asignacion[] }
}

/**
 * Drops every asignacion for a given (proyecto_id, bp_id) — removes the BP
 * from the project entirely. Doesn't touch sueldos.
 */
export async function deleteAsignacionesForBp(
  proyecto_id: Id,
  bp_id: Id
): Promise<DeleteResult> {
  const { error } = await supabase
    .from('asignaciones')
    .delete()
    .eq('proyecto_id', proyecto_id)
    .eq('bp_id', bp_id)
  if (error) {
    logQueryError('deleteAsignacionesForBp', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ----- per-BP asignaciones (full year, by project — inverse view) -------

export interface BPAsignacionRow {
  proyecto: Proyecto | null
  proyecto_id: string
  proyecto_name: string
  /** Length-12 array; index i = month (i+1). 0 for months without a row. */
  horas_por_mes: number[]
  /** Sum of horas across the year. */
  totalHoras: number
}

export interface BPAsignacionesFullYear {
  bp: BrandPartner | null
  rows: BPAsignacionRow[]
}

/**
 * For a given BP: every project they have at least one asignacion on,
 * with a 12-slot array of monthly hours. Sorted by total hours desc.
 * Inverse of getProjectAsignacionesFullYear.
 */
export async function getBPAsignacionesFullYear(
  bp_id: Id
): Promise<BPAsignacionesFullYear> {
  const [bpRes, asignaciones, proyectos] = await Promise.all([
    supabase
      .from('brand_partners')
      .select('*, grouper_rel:groupers(nombre)')
      .eq('id', bp_id)
      .maybeSingle(),
    (async () => {
      const { data, error } = await supabase
        .from('asignaciones')
        .select('*')
        .eq('bp_id', bp_id)
      if (error) {
        logQueryError('getBPAsignacionesFullYear.asignaciones', error)
        return [] as Asignacion[]
      }
      return (data ?? []) as Asignacion[]
    })(),
    getProyectos(),
  ])
  if (bpRes.error) {
    logQueryError('getBPAsignacionesFullYear.bp', bpRes.error)
  }
  const bp = bpRes.data
    ? (flattenGrouper(bpRes.data) as unknown as BrandPartner)
    : null
  const projectMap = new Map(proyectos.map((p) => [String(p.id), p]))
  const byProj = new Map<string, number[]>()
  for (const a of asignaciones) {
    const k = String(a.proyecto_id)
    let arr = byProj.get(k)
    if (!arr) {
      arr = new Array(12).fill(0)
      byProj.set(k, arr)
    }
    if (a.mes >= 1 && a.mes <= 12) {
      arr[a.mes - 1] += Number(a.horas) || 0
    }
  }
  const rows: BPAsignacionRow[] = []
  for (const [proyecto_id, horas_por_mes] of byProj.entries()) {
    const proyecto = projectMap.get(proyecto_id) ?? null
    rows.push({
      proyecto,
      proyecto_id,
      proyecto_name: proyecto?.nombre ?? 'Proyecto desconocido',
      horas_por_mes,
      totalHoras: horas_por_mes.reduce((s, x) => s + x, 0),
    })
  }
  rows.sort((a, b) => b.totalHoras - a.totalHoras)
  return { bp, rows }
}

// ----- bulk full-year edits ----------------------------------------------

export interface MonthlyHonorario {
  mes: number
  honorarios: number
  /** Present when the row already exists in horas_contratadas. */
  id?: Id
}

export interface MonthlySueldo {
  mes: number
  sueldo: number
  /** Present when the row already exists in sueldos. */
  id?: Id
}

const FULL_YEAR_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * Returns the project's per-month honorarios for the full year, reading
 * from `proyecto_honorarios_mensuales` (id, proyecto_id, mes, honorarios).
 * Months without a row come back as `{mes, honorarios: 0}` (no `id`).
 */
export async function getProjectHonorarioFullYear(
  proyecto_id: Id
): Promise<MonthlyHonorario[]> {
  const { data, error } = await supabase
    .from('proyecto_honorarios_mensuales')
    .select('id, mes, honorarios')
    .eq('proyecto_id', proyecto_id)
    .order('mes', { ascending: true })
  if (error) {
    logQueryError('getProjectHonorarioFullYear', error)
    return FULL_YEAR_MONTHS.map((mes) => ({ mes, honorarios: 0 }))
  }
  const rows = (data ?? []) as { id: Id; mes: number; honorarios: number }[]
  return FULL_YEAR_MONTHS.map((mes) => {
    const r = rows.find((x) => x.mes === mes)
    return {
      mes,
      honorarios: r ? Number(r.honorarios) : 0,
      id: r?.id,
    }
  })
}

/**
 * Upserts up to 12 honorario rows in `proyecto_honorarios_mensuales`.
 * Requires a UNIQUE constraint on (proyecto_id, mes) — included in the
 * recommended schema. The whole batch is sent in one round-trip.
 */
export async function updateProjectHonorarioFullYear(
  proyecto_id: Id,
  honorariosPorMes: { mes: number; honorarios: number }[]
): Promise<CreateResult<ProyectoHonorarioMensual[]>> {
  const rows = honorariosPorMes.map((h) => ({
    proyecto_id,
    mes: h.mes,
    honorarios: Math.max(0, Number(h.honorarios) || 0),
  }))
  const { data, error } = await supabase
    .from('proyecto_honorarios_mensuales')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: 'proyecto_id,mes' })
    .select()
  if (error) {
    logQueryError('updateProjectHonorarioFullYear', error)
    return { success: false, error: error.message }
  }
  return {
    success: true,
    data: (data ?? []) as ProyectoHonorarioMensual[],
  }
}

/** Per-month sueldos for a BP, padded with `{mes, sueldo: 0}` for months without a row. */
export async function getBPSueldosFullYear(
  bp_id: Id
): Promise<MonthlySueldo[]> {
  const rows = await getSalaryHistory(bp_id)
  return FULL_YEAR_MONTHS.map((mes) => {
    const r = rows.find((x) => x.mes === mes)
    return {
      mes,
      sueldo: r ? Number(r.sueldo) : 0,
      id: r?.id,
    }
  })
}

/**
 * Upserts up to 12 sueldo rows. Requires a UNIQUE constraint on
 * (bp_id, mes). Errors surface in the result.
 */
export async function updateBPSueldosFullYear(
  bp_id: Id,
  sueldosPorMes: { mes: number; sueldo: number }[]
): Promise<CreateResult<Sueldo[]>> {
  const rows = sueldosPorMes.map((s) => ({
    bp_id,
    mes: s.mes,
    sueldo: Math.max(0, Number(s.sueldo) || 0),
  }))
  const { data, error } = await supabase
    .from('sueldos')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: 'bp_id,mes' })
    .select()
  if (error) {
    logQueryError('updateBPSueldosFullYear', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: (data ?? []) as Sueldo[] }
}
