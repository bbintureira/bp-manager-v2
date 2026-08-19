import type {
  Asignacion,
  BrandPartner,
  Id,
  Proyecto,
  Sueldo,
} from './queries'

/** Working hours in a month — used for $/h and utilization math. */
export const HOURS_PER_MONTH = 160

// ---------------------------------------------------------------------------
// Profitability model (per-project / per-BP rates)
// ---------------------------------------------------------------------------

/**
 * @deprecated Reads the cached scalar `proyecto.precio_mensual` (which is
 *   auto-derived from the monthly honorarios table on save). For new code
 *   prefer `valorHoraProyectoForMonth` so the rate reflects the actual
 *   monthly honorarios row, not the annual average snapshot.
 *
 * Project's per-hour value: precio_mensual / horas_requeridas_mensual.
 * Falls back to legacy `honorarios_cotizador / 160` when the new fields
 * aren't filled. Returns 0 when neither path yields a positive rate. */
export function valorHoraProyecto(p: Proyecto): number {
  const precio =
    p.precio_mensual != null
      ? Number(p.precio_mensual)
      : Number(p.honorarios_cotizador)
  const horas =
    p.horas_requeridas_mensual != null
      ? Number(p.horas_requeridas_mensual)
      : HOURS_PER_MONTH
  if (!Number.isFinite(precio) || !Number.isFinite(horas) || horas <= 0) return 0
  return precio / horas
}

export interface ProjectRentabilidadSummary {
  proyecto: Proyecto
  /** valor_hora_proyecto = precio_mensual / horas_requeridas_mensual. */
  valorHora: number
  /** Weighted average costo/h across the BPs assigned to the project,
   * weighted by hours. 0 when no BPs are assigned. */
  costoHoraPromedioBps: number
  /** Distinct BPs assigned at any point in the year. */
  numBps: number
  /** valorHora - costoHoraPromedioBps (per-hour ganancia). */
  diferenciaPorHora: number
  /** True iff diferenciaPorHora > 0. */
  rentable: boolean
  /** Total hours assigned to this project across the year. */
  totalHoras: number
  /** Aggregate ganancia in pesos: diferencia × totalHoras. */
  rentabilidadTotal: number
}

/**
 * Per-project rentabilidad summary using the new model. Costo is weighted
 * by hours so a BP that worked one month contributes proportionally less
 * than one who worked all year. BPs without `sueldo_mensual` set count
 * as 0 cost — they don't degrade the average, but inflate the apparent
 * rentabilidad. Surface this in the UI when relevant.
 */
export function summarizeProjectRentabilidad(
  proyecto: Proyecto,
  asignaciones: Asignacion[],
  brandPartners: BrandPartner[],
  sueldos: Sueldo[],
  capacidades: CapacidadMensual[] = []
): ProjectRentabilidadSummary {
  const own = asignaciones.filter((a) => same(a.proyecto_id, proyecto.id))
  const totalHoras = own.reduce((s, a) => s + num(a.horas), 0)
  const bpMap = new Map(brandPartners.map((bp) => [String(bp.id), bp]))
  const bpIds = new Set(own.map((a) => String(a.bp_id)))
  let weightedCost = 0
  for (const a of own) {
    const bp = bpMap.get(String(a.bp_id))
    if (!bp) continue
    // Per-month rate (sueldo[mes] / cap_bp) — using the asignacion's mes
    // so monthly sueldo variations and BP capacities are respected.
    weightedCost +=
      valorHoraBPForMonth(bp, sueldos, a.mes, capacidades) * num(a.horas)
  }
  const costoHoraPromedioBps =
    totalHoras > 0 ? weightedCost / totalHoras : 0
  const valorHora = valorHoraProyecto(proyecto)
  const diferencia = valorHora - costoHoraPromedioBps
  return {
    proyecto,
    valorHora,
    costoHoraPromedioBps,
    numBps: bpIds.size,
    diferenciaPorHora: diferencia,
    rentable: diferencia > 0 && totalHoras > 0,
    totalHoras,
    rentabilidadTotal: diferencia * totalHoras,
  }
}

export function summarizeAllProjectsRentabilidad(
  proyectos: Proyecto[],
  asignaciones: Asignacion[],
  brandPartners: BrandPartner[],
  sueldos: Sueldo[],
  capacidades: CapacidadMensual[] = []
): ProjectRentabilidadSummary[] {
  return proyectos.map((p) =>
    summarizeProjectRentabilidad(
      p,
      asignaciones,
      brandPartners,
      sueldos,
      capacidades
    )
  )
}

export interface AggregatedRentabilidad {
  /** Sum of (valorHora - costoHora) × horas across every asignacion. */
  total: number
  /** Number of projects with diferencia > 0 (and at least 1 BP). */
  rentables: number
  /** Number of projects with diferencia <= 0 and at least 1 BP. */
  noRentables: number
  /** Weighted average diferencia/h across the whole portfolio. */
  diferenciaPromedio: number
  /** Total hours across all asignaciones (denominator of the avg). */
  totalHoras: number
}

export function aggregateRentabilidad(
  summaries: ProjectRentabilidadSummary[]
): AggregatedRentabilidad {
  const active = summaries.filter((s) => s.totalHoras > 0)
  const total = active.reduce((s, x) => s + x.rentabilidadTotal, 0)
  const totalHoras = active.reduce((s, x) => s + x.totalHoras, 0)
  return {
    total,
    rentables: active.filter((s) => s.rentable).length,
    noRentables: active.filter((s) => !s.rentable).length,
    diferenciaPromedio: totalHoras > 0 ? total / totalHoras : 0,
    totalHoras,
  }
}

const same = (a: Id, b: Id) => String(a) === String(b)
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Month (1-12) the BP joined the team. Reads from `fecha_ingreso` —
 * NULL or unparseable values fall back to January (1), matching the
 * DB default. Annual aggregations skip months before this so a BP that
 * joined in March doesn't get charged Jan + Feb capacity.
 */
export function getMesIngreso(bp: BrandPartner): number {
  const fi = bp.fecha_ingreso
  if (!fi) return 1
  // 'YYYY-MM-DD' from Postgres DATE — month is the 6th–7th char.
  const m = Number(fi.slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1
}

/**
 * Last month (1-12) the BP is counted in annual aggregations.
 *  - Active BPs (`bp.activo` true or null) → 12, no upper bound.
 *  - Inactive BPs (`bp.activo === false`) → the latest mes that has a
 *    sueldo row for this BP. With no sueldo history we treat the BP as
 *    "left immediately after joining" and return `getMesIngreso(bp)`
 *    so they're counted for exactly one month.
 *
 * Pair with `getMesIngreso` to define the BP's [ingreso, egreso] range.
 */
export function getMesEgreso(bp: BrandPartner, sueldos: Sueldo[]): number {
  if (bp.activo !== false) return 12
  let max = 0
  for (const s of sueldos) {
    if (!same(s.bp_id, bp.id)) continue
    const m = Number(s.mes)
    if (Number.isFinite(m) && m > max && m <= 12) max = m
  }
  return max > 0 ? max : getMesIngreso(bp)
}

/** True iff `mes` is within the BP's active window
 *  (inclusive of both ingreso and egreso). */
function inActiveWindow(
  bp: BrandPartner,
  mes: number,
  sueldos: Sueldo[]
): boolean {
  if (mes < getMesIngreso(bp)) return false
  if (mes > getMesEgreso(bp, sueldos)) return false
  return true
}

// ---------------------------------------------------------------------------
// Top-level KPIs
// ---------------------------------------------------------------------------

/**
 * Overall margin %. Returns 0 if revenue is non-positive (rather than
 * NaN / Infinity) so the UI doesn't blow up on empty months.
 */
export function calculateMargin(revenue: number, costs: number): number {
  if (revenue <= 0) return 0
  return ((revenue - costs) / revenue) * 100
}

// ---------------------------------------------------------------------------
// Per-project summary (used to build table rows + bar chart)
// ---------------------------------------------------------------------------

export interface ProjectMonthSummary {
  proyecto: Proyecto
  /** Number of distinct BPs assigned to the project this month. */
  bps: number
  /** Total hours logged on the project this month. */
  totalHoras: number
  /** Avg utilization across the project's BPs (0–110+). */
  utilization: number
  /** Project's per-hour rate for `mes`: honorarios[mes] / horas_req[mes]. */
  projectRate: number
  /** Mean of per-hour BP rates for `mes` (each is sueldo[mes] / cap_bp). */
  avgBpRate: number
  /** Earned revenue for this project in `mes`. */
  revenue: number
  /**
   * Project cost — Σ asignacion horas × (sueldo[mes] / cap_bp). Uses the
   * per-month sueldo and the BP's contracted hours, so it accurately
   * reflects the cost of the assigned hours (not the full sueldo).
   */
  cost: number
  /** revenue - cost (in pesos). */
  marginAbsolute: number
  /** (revenue - cost) / revenue × 100. 0 when revenue ≤ 0. */
  marginPercent: number
  /**
   * HC — quoted/budgeted hours for this project in `mes` (from
   * `horas_proyecto`, fallback scalar `horas_requeridas_mensual`, then 160).
   * Independent of hours actually assigned (HA = `totalHoras`).
   */
  horasCotizadas: number
  /**
   * "Diferencia por cálculo comercial" in hours: HC - HA. Positive means
   * the project was over-quoted (we save); negative means under-quoted (we
   * lose). Pure estimation error — NOT idle capacity.
   */
  diffHorasComercial: number
  /** The same difference valued at the project's per-hour rate:
   *  (HC - HA) × projectRate. Same currency as `revenue`. */
  diffPlataComercial: number
}

/**
 * Per-project summary for `mes`. Revenue is the booked honorarios for that
 * month (from `proyecto_honorarios_mensuales`) — NOT a scalar × hours
 * fallback. Cost is the per-BP rate × hours worked sum across the
 * asignaciones in that month.
 */
export function calculateProjectMargin(
  proyecto: Proyecto,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  mes: number,
  brandPartners?: BrandPartner[],
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[],
  horasMensuales?: { proyecto_id: Id; mes: number; horas: number }[],
  capacidades: CapacidadMensual[] = []
): ProjectMonthSummary {
  const own = asignaciones.filter(
    (a) => a.mes === mes && same(a.proyecto_id, proyecto.id)
  )
  const totalHoras = own.reduce((s, a) => s + num(a.horas), 0)
  const bpIds = Array.from(new Set(own.map((a) => String(a.bp_id))))
  const bps = bpIds.length

  // Effective project rate: honorarios[mes] / horas[mes] from the
  // per-month tables, with scalar fallbacks.
  const projectRate = valorHoraProyectoForMonth(
    proyecto,
    honorariosMensuales ?? [],
    mes,
    horasMensuales ?? [],
    totalHoras > 0 ? totalHoras : undefined // cap rate if over budget
  )

  // Per-BP rate via the per-month profitability model: sueldo[mes] / cap_bp.
  // Uses the actual sueldo row for the selected mes (not the scalar avg).
  const bpsById = new Map(
    (brandPartners ?? []).map((bp) => [String(bp.id), bp])
  )
  const bpRateById = new Map<string, number>()
  for (const id of bpIds) {
    const bp = bpsById.get(id)
    bpRateById.set(
      id,
      bp ? valorHoraBPForMonth(bp, sueldos, mes, capacidades) : 0
    )
  }

  // Average BP rate across the BPs assigned this month — used only for the
  // per-hour margin column (display).
  const bpRates = bpIds.map((id) => bpRateById.get(id) ?? 0)
  const avgBpRate =
    bpRates.length === 0 ? 0 : bpRates.reduce((s, r) => s + r, 0) / bpRates.length

  const utilization =
    bps === 0 ? 0 : (totalHoras / (HOURS_PER_MONTH * bps)) * 100

  // Booked revenue for this month: the honorarios row for `mes`. Doesn't
  // depend on hours worked — what you've contracted to bill that month.
  const honorariosRow = honorariosMensuales?.find(
    (h) => h.mes === mes && same(h.proyecto_id, proyecto.id)
  )
  const revenue = honorariosRow
    ? num(honorariosRow.honorarios)
    : // Fallback to the deprecated scalar only when no monthly data was
      // passed in. Avoid the silent zero when the project has loaded
      // honorarios but the caller forgot to thread them through.
      honorariosMensuales === undefined
      ? num(proyecto.precio_mensual ?? proyecto.honorarios_cotizador)
      : 0
  // Per-asignacion cost: each BP's hourly cost × hours that BP worked here.
  const cost = own.reduce((s, a) => {
    const rate = bpRateById.get(String(a.bp_id)) ?? 0
    return s + rate * num(a.horas)
  }, 0)
  const marginAbsolute = revenue - cost
  const marginPercent =
    revenue > 0 ? (marginAbsolute / revenue) * 100 : 0

  // "Diferencia por cálculo comercial": quoted hours (HC) vs assigned
  // hours (HA = totalHoras), valued at the project's per-hour rate. Kept
  // separate from idle-capacity math — this measures estimation error.
  const horasCotizadas = horasCotizadasProyectoForMonth(
    proyecto,
    horasMensuales ?? [],
    mes
  )
  const diffHorasComercial = horasCotizadas - totalHoras
  const diffPlataComercial = diffHorasComercial * projectRate

  return {
    proyecto,
    bps,
    totalHoras,
    utilization,
    projectRate,
    avgBpRate,
    revenue,
    cost,
    marginAbsolute,
    marginPercent,
    horasCotizadas,
    diffHorasComercial,
    diffPlataComercial,
  }
}

export function summarizeAllProjects(
  proyectos: Proyecto[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  mes: number,
  brandPartners?: BrandPartner[],
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[],
  horasMensuales?: { proyecto_id: Id; mes: number; horas: number }[],
  capacidades: CapacidadMensual[] = []
): ProjectMonthSummary[] {
  return proyectos.map((p) =>
    calculateProjectMargin(
      p,
      asignaciones,
      sueldos,
      mes,
      brandPartners,
      honorariosMensuales,
      horasMensuales,
      capacidades
    )
  )
}

// ---------------------------------------------------------------------------
// Per-BP summary (used in the Brand Partners dashboard table)
// ---------------------------------------------------------------------------

export type BPEstado = 'active' | 'idle' | 'over' | 'neutral'

export interface BPMonthSummary {
  bp: BrandPartner
  /** Sueldo for the selected month (0 when no row is present). */
  sueldoMensual: number
  /** Total hours assigned across projects this month. */
  totalHoras: number
  /** Distinct projects this BP is on this month. */
  numProyectos: number
  /** Utilization % = totalHoras / 160 * 100. */
  utilization: number
  /**
   *  - `over`     → utilization > 100
   *  - `active`   → 80 ≤ utilization ≤ 100
   *  - `idle`     → 0 < utilization < 80
   *  - `neutral`  → no assignments at all this month
   */
  estado: BPEstado
}

export function calculateBPSummary(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  mes: number
): BPMonthSummary {
  // Outside the BP's active window: pre-ingreso or post-egreso → zero row.
  if (!inActiveWindow(bp, mes, sueldos)) {
    return {
      bp,
      sueldoMensual: 0,
      totalHoras: 0,
      numProyectos: 0,
      utilization: 0,
      estado: 'neutral',
    }
  }

  const own = asignaciones.filter(
    (a) => a.mes === mes && same(a.bp_id, bp.id)
  )
  const totalHoras = own.reduce((s, a) => s + num(a.horas), 0)
  const numProyectos = new Set(own.map((a) => String(a.proyecto_id))).size
  const sueldoRow = sueldos.find(
    (s) => s.mes === mes && same(s.bp_id, bp.id)
  )
  const sueldoMensual = sueldoRow ? num(sueldoRow.sueldo) : 0
  const utilization = (totalHoras / HOURS_PER_MONTH) * 100

  let estado: BPEstado
  if (totalHoras === 0) estado = 'neutral'
  else if (utilization > 100) estado = 'over'
  else if (utilization < 80) estado = 'idle'
  else estado = 'active'

  return { bp, sueldoMensual, totalHoras, numProyectos, utilization, estado }
}

export function summarizeAllBPs(
  brandPartners: BrandPartner[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  mes: number
): BPMonthSummary[] {
  return brandPartners.map((bp) =>
    calculateBPSummary(bp, asignaciones, sueldos, mes)
  )
}

// ---------------------------------------------------------------------------
// Sueldo deltas (used in /gestión/sueldos)
// ---------------------------------------------------------------------------

export type SueldoTrend = 'up' | 'down' | 'flat' | 'new' | 'absent'

export interface SueldoRow {
  /** Sueldo for the selected month, or null when not loaded for this BP. */
  sueldo: Sueldo | null
  bp: BrandPartner | null
  /** Selected month (always set, regardless of whether sueldo exists). */
  mes: number
  /** Sueldo for the previous month (null when none on file). */
  prevSueldo: number | null
  /** current - prev (null when no current or no prev). */
  delta: number | null
  /** % delta vs prev (null when not computable). */
  deltaPercent: number | null
  trend: SueldoTrend
}

/**
 * Builds one row per BP for the selected month, showing each BP whether
 * or not they have a sueldo loaded. Trend `absent` means there's no
 * sueldo row for that BP/mes combo.
 */
export function joinSueldosWithPrev(
  current: Sueldo[],
  prev: Sueldo[],
  brandPartners: BrandPartner[],
  mes: number
): SueldoRow[] {
  const currMap = new Map(current.map((s) => [String(s.bp_id), s]))
  const prevMap = new Map(prev.map((s) => [String(s.bp_id), num(s.sueldo)]))
  return brandPartners.map((bp) => {
    const sueldo = currMap.get(String(bp.id)) ?? null
    const prevAmount = prevMap.has(String(bp.id))
      ? (prevMap.get(String(bp.id)) as number)
      : null
    let delta: number | null = null
    let deltaPercent: number | null = null
    let trend: SueldoTrend = 'absent'
    if (sueldo) {
      const cur = num(sueldo.sueldo)
      if (prevAmount !== null) {
        delta = cur - prevAmount
        deltaPercent = prevAmount > 0 ? (delta / prevAmount) * 100 : null
        trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
      } else {
        trend = 'new'
      }
    }
    return {
      sueldo,
      bp,
      mes,
      prevSueldo: prevAmount,
      delta,
      deltaPercent,
      trend,
    }
  })
}

/** Previous month, wrapping 1 → 12. (No year support yet — see schema notes.) */
export function previousMonth(mes: number): number {
  return mes === 1 ? 12 : mes - 1
}

// ---------------------------------------------------------------------------
// Annual aggregates (used by the "Vista anual" toggle and detail modals)
// ---------------------------------------------------------------------------

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export interface ProjectAnnualSummary {
  proyecto: Proyecto
  /** Sum of revenue across the 12 months. */
  revenue: number
  /** Sum of (full) sueldos for any BP that touched this project, by month. */
  cost: number
  /** Sum of hours logged on this project across the year. */
  totalHoras: number
  /** Distinct BPs that worked on this project at any point. */
  uniqueBps: number
  /** Avg of monthly utilization (only counting months with assignments). */
  avgUtilization: number
  /** revenue - cost (in pesos). */
  marginAbsolute: number
  /** (revenue - cost) / revenue × 100. 0 if revenue ≤ 0. */
  marginPercent: number
  /** Σ HC across active months (those with hours assigned). */
  horasCotizadas: number
  /** Σ (HC - HA) across active months. Same sign convention as monthly. */
  diffHorasComercial: number
  /** Σ (HC_m - HA_m) × rate_m across active months — respects the
   *  monthly variation of both rate and quoted hours. */
  diffPlataComercial: number
  /** Per-month breakdown, indexed 0..11 (mes = i+1). */
  byMonth: ProjectMonthSummary[]
}

export function summarizeProjectsAnnual(
  proyectos: Proyecto[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  brandPartners?: BrandPartner[],
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[],
  horasMensuales?: { proyecto_id: Id; mes: number; horas: number }[],
  capacidades: CapacidadMensual[] = []
): ProjectAnnualSummary[] {
  return proyectos.map((p) => {
    const byMonth = MONTHS.map((m) =>
      calculateProjectMargin(
        p,
        asignaciones,
        sueldos,
        m,
        brandPartners,
        honorariosMensuales,
        horasMensuales,
        capacidades
      )
    )
    // Only sum the months where the project actually has BPs doing work
    // (horas > 0). Empty / future months — and stale 0-hour asignaciones
    // — drop out instead of zero-inflating the totals. Keeps the row's
    // Ingresos in sync with the annual KPI which uses the same rule.
    const months = byMonth.filter((m) => m.totalHoras > 0)
    const revenue = months.reduce((s, x) => s + x.revenue, 0)
    // (kept inline instead of reusing `aggregateProjectMonths` so the
    // annual numbers stay pinned to the `totalHoras > 0` rule)
    const cost = months.reduce((s, x) => s + x.cost, 0)
    const totalHoras = months.reduce((s, x) => s + x.totalHoras, 0)
    // Commercial difference (HC - HA) aggregated only over active months,
    // valued month-by-month so rate + quoted-hours variation is respected.
    const horasCotizadas = months.reduce((s, x) => s + x.horasCotizadas, 0)
    const diffHorasComercial = months.reduce(
      (s, x) => s + x.diffHorasComercial,
      0
    )
    const diffPlataComercial = months.reduce(
      (s, x) => s + x.diffPlataComercial,
      0
    )
    const avgUtilization =
      months.length === 0
        ? 0
        : months.reduce((s, x) => s + x.utilization, 0) / months.length
    const ownAsignaciones = asignaciones.filter(
      (a) => same(a.proyecto_id, p.id)
    )
    const uniqueBps = new Set(ownAsignaciones.map((a) => String(a.bp_id))).size
    const marginAbsolute = revenue - cost
    const marginPercent = revenue > 0 ? (marginAbsolute / revenue) * 100 : 0
    return {
      proyecto: p,
      revenue,
      cost,
      totalHoras,
      uniqueBps,
      avgUtilization,
      marginAbsolute,
      marginPercent,
      horasCotizadas,
      diffHorasComercial,
      diffPlataComercial,
      byMonth,
    }
  })
}

/**
 * Same aggregate as `summarizeProjectsAnnual` but restricted to an
 * arbitrary set of months — used by the quarterly (Q1..Q4) scope.
 *
 * A month counts when the project has assigned hours OR booked honorarios
 * that month, so a quarter equals exactly the sum of the three monthly
 * views (the annual variant is stricter — hours only — and is left
 * untouched so its numbers don't move). That matters for the commercial
 * difference: a project that sold hours and assigned none must still show
 * up, it's the very case the view exists for.
 *
 * `byMonth` stays 12-long (index = mes - 1); months outside `meses` are
 * present but never counted.
 */
export function summarizeProjectsPeriod(
  proyectos: Proyecto[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  meses: number[],
  brandPartners?: BrandPartner[],
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[],
  horasMensuales?: { proyecto_id: Id; mes: number; horas: number }[],
  capacidades: CapacidadMensual[] = []
): ProjectAnnualSummary[] {
  const inScope = new Set(meses)
  return proyectos.map((p) => {
    const byMonth = MONTHS.map((m) =>
      calculateProjectMargin(
        p,
        asignaciones,
        sueldos,
        m,
        brandPartners,
        honorariosMensuales,
        horasMensuales,
        capacidades
      )
    )
    const months = byMonth.filter(
      (m, i) => inScope.has(i + 1) && (m.totalHoras > 0 || m.revenue > 0)
    )
    const revenue = months.reduce((s, x) => s + x.revenue, 0)
    const cost = months.reduce((s, x) => s + x.cost, 0)
    const totalHoras = months.reduce((s, x) => s + x.totalHoras, 0)
    const horasCotizadas = months.reduce((s, x) => s + x.horasCotizadas, 0)
    const diffHorasComercial = months.reduce(
      (s, x) => s + x.diffHorasComercial,
      0
    )
    const diffPlataComercial = months.reduce(
      (s, x) => s + x.diffPlataComercial,
      0
    )
    const avgUtilization =
      months.length === 0
        ? 0
        : months.reduce((s, x) => s + x.utilization, 0) / months.length
    const uniqueBps = new Set(
      asignaciones
        .filter(
          (a) =>
            same(a.proyecto_id, p.id) && inScope.has(Number(a.mes)) && num(a.horas) > 0
        )
        .map((a) => String(a.bp_id))
    ).size
    const marginAbsolute = revenue - cost
    const marginPercent = revenue > 0 ? (marginAbsolute / revenue) * 100 : 0
    return {
      proyecto: p,
      revenue,
      cost,
      totalHoras,
      uniqueBps,
      avgUtilization,
      marginAbsolute,
      marginPercent,
      horasCotizadas,
      diffHorasComercial,
      diffPlataComercial,
      byMonth,
    }
  })
}

export interface BPAnnualSummary {
  bp: BrandPartner
  /** Sum of sueldos across all months on file. */
  totalSueldo: number
  /** Mean sueldo over months that have a row. */
  avgSueldo: number
  /** Total hours logged across the year. */
  totalHoras: number
  /** Distinct projects this BP worked on at any point. */
  uniqueProjects: number
  /** Mean utilization across the 12 months. */
  avgUtilization: number
  /** True iff the BP had no asignaciones at all in the year. */
  withoutAssignments: boolean
  /** Per-month breakdown, indexed 0..11 (mes = i+1). */
  byMonth: BPMonthSummary[]
}

export function summarizeBPsAnnual(
  brandPartners: BrandPartner[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[]
): BPAnnualSummary[] {
  return brandPartners.map((bp) => {
    const byMonth = MONTHS.map((m) =>
      calculateBPSummary(bp, asignaciones, sueldos, m)
    )
    const ownSueldos = sueldos.filter((s) => same(s.bp_id, bp.id))
    const totalSueldo = ownSueldos.reduce((s, x) => s + num(x.sueldo), 0)
    const avgSueldo =
      ownSueldos.length === 0 ? 0 : totalSueldo / ownSueldos.length
    const totalHoras = byMonth.reduce((s, x) => s + x.totalHoras, 0)
    const ownAsignaciones = asignaciones.filter((a) => same(a.bp_id, bp.id))
    const uniqueProjects = new Set(
      ownAsignaciones.map((a) => String(a.proyecto_id))
    ).size
    const avgUtilization =
      byMonth.reduce((s, x) => s + x.utilization, 0) / byMonth.length
    return {
      bp,
      totalSueldo,
      avgSueldo,
      totalHoras,
      uniqueProjects,
      avgUtilization,
      withoutAssignments: ownAsignaciones.length === 0,
      byMonth,
    }
  })
}

// ---------------------------------------------------------------------------
// Distribution breakdowns (used by the rich detail modals)
// ---------------------------------------------------------------------------

export type BPProjectEstado = 'rentable' | 'neutral' | 'perdida'

export interface ProjectBPBreakdown {
  bp: BrandPartner | null
  bp_id: string
  bp_name: string
  /** Sum of hours this BP logged on the project across the 12 months. */
  totalHoras: number
  /** Length-12 array; index i = month (i+1). */
  horasPorMes: number[]
  /** % of the project's total hours that this BP contributed (0-100). */
  percentOfProject: number
  /** Yearly sueldo billed for this BP (for reference). */
  totalSueldo: number
  /** Project's contractual per-hour rate: average of
   *  `honorarios_mes / horas_requeridas_mensual` over months with data.
   *  Same for every row in the project. */
  ratePerHourProyecto: number
  /** Per-month project per-hour rate (length 12):
   *  `honorarios[m] / MAX(horas_req[m], horas_asignadas_total[m])`.
   *  Project-level — same array for every row. Use this in monthly views
   *  so the rate reflects the selected month (capped when over budget)
   *  instead of the yearly average. */
  ratePerHourProyectoPorMes: number[]
  /** Effective per-hour BP rate, weighted by hours actually worked:
   *  `Σ horas[m] × (sueldo[m]/cap_bp) / Σ horas[m]`. Stays consistent
   *  with `costosAnuales`. */
  ratePerHourBpAvg: number
  /** Per-month per-hour BP rate (length 12): `sueldo[m] / cap_bp`.
   *  0 in months with no sueldo on file. */
  ratePerHourBpPorMes: number[]
  /** Reference value of this BP's hours at the project's contractual rate:
   *  `Σ_mes horas_bp[m] × (honorarios[m] / horas_requeridas_mensual)`.
   *  Not a real income figure — compared to `costosAnuales` it answers
   *  "is the project profitable on this BP at the contracted rate?". */
  ingresosAnuales: number
  /** Per-month reference ingreso (length 12): `horas_bp[m] × honorarios[m] / horas_req`. */
  ingresosPorMes: number[]
  /** Yearly cost the BP represents on the project:
   *  `Σ horas[mes] × (sueldo[mes] / cap_bp)`. */
  costosAnuales: number
  /** Per-month cost (length 12): `horas_bp[m] × sueldo_bp[m] / cap_bp`. */
  costosPorMes: number[]
  /** (ingresos - costos) / ingresos × 100. 0 if ingresos ≤ 0. */
  marginPercent: number
  /** Bucketed margin status: > 20% rentable, 0–20 neutral, ≤ 0 perdida. */
  estado: BPProjectEstado
}

/**
 * Group `asignaciones` by BP for a given project, with month-by-month hours
 * and the BP's % share of total project hours. Sorted by hours desc.
 *
 * Per-BP ingresos use the project's contractual hourly rate:
 *   `ingreso_bp = Σ_mes horas_bp[m] × (honorarios[m] / horas_requeridas_mensual)`
 * This represents "what those hours are worth at project rate" — a
 * theoretical reference for comparing against the BP's actual cost.
 * The sum across BPs does NOT necessarily equal the project's booked
 * revenue: if BPs collectively worked fewer hours than `horas_requeridas`,
 * the project has unrealized income (sub-utilization); if more, the
 * opposite. The comparison ingreso_ref vs costo is what surfaces the
 * project's profitability decision per BP.
 */
export function buildBPsForProject(
  proyecto: Proyecto,
  asignaciones: Asignacion[],
  brandPartners: BrandPartner[],
  sueldos: Sueldo[],
  honorariosMensuales: { mes: number; honorarios: number }[] = [],
  horasMensuales: { mes: number; horas: number }[] = [],
  capacidades: CapacidadMensual[] = []
): ProjectBPBreakdown[] {
  const own = asignaciones.filter((a) => same(a.proyecto_id, proyecto.id))
  const totalProject = own.reduce((s, a) => s + num(a.horas), 0)
  const bpMap = new Map(brandPartners.map((b) => [String(b.id), b]))

  // Project's contractual rate per month: honorarios[m] / horas[m] —
  // per-month horas come from `horas_proyecto` (or fall back to scalar).
  const horasScalar =
    proyecto.horas_requeridas_mensual != null &&
    num(proyecto.horas_requeridas_mensual) > 0
      ? num(proyecto.horas_requeridas_mensual)
      : HOURS_PER_MONTH
  const horasReqPorMes = new Array(12).fill(0) as number[]
  for (let i = 0; i < 12; i++) horasReqPorMes[i] = horasScalar
  for (const h of horasMensuales) {
    const idx = h.mes - 1
    if (idx >= 0 && idx < 12 && num(h.horas) > 0) {
      horasReqPorMes[idx] = num(h.horas)
    }
  }
  const honorariosPorMes = new Array(12).fill(0) as number[]
  for (const h of honorariosMensuales) {
    const idx = h.mes - 1
    if (idx >= 0 && idx < 12) honorariosPorMes[idx] = num(h.honorarios)
  }
  // Total assigned hours per month across all BPs for this project
  const horasAsigTotalPorMes = new Array(12).fill(0) as number[]
  for (const a of own) {
    const idx = a.mes - 1
    if (idx >= 0 && idx < 12) horasAsigTotalPorMes[idx] += num(a.horas)
  }

  const ratePerHourProyectoPorMes = honorariosPorMes.map((hon, i) => {
    const hrReq = horasReqPorMes[i]
    const hrAsig = horasAsigTotalPorMes[i]
    // Use max of budgeted vs assigned so rate adjusts when over budget
    const hr = Math.max(hrReq, hrAsig > 0 ? hrAsig : 0)
    return hon > 0 && hr > 0 ? hon / hr : 0
  })
  // Single "project rate" shown in the row: avg of months with booked
  // honorarios. Falls back to the deprecated scalar only if nothing was
  // loaded into the monthly grid.
  const monthsWithHonorarios = ratePerHourProyectoPorMes.filter((r) => r > 0)
  const ratePerHourProyecto =
    monthsWithHonorarios.length > 0
      ? monthsWithHonorarios.reduce((s, r) => s + r, 0) /
        monthsWithHonorarios.length
      : valorHoraProyecto(proyecto)

  const byBp = new Map<string, Asignacion[]>()
  for (const a of own) {
    const k = String(a.bp_id)
    let list = byBp.get(k)
    if (!list) {
      list = []
      byBp.set(k, list)
    }
    list.push(a)
  }

  const rows: ProjectBPBreakdown[] = []
  for (const [bpId, asigs] of byBp.entries()) {
    const horasPorMes = new Array(12).fill(0) as number[]
    for (const a of asigs) {
      const idx = a.mes - 1
      if (idx >= 0 && idx < 12) horasPorMes[idx] += num(a.horas)
    }
    const totalHoras = horasPorMes.reduce((s, x) => s + x, 0)
    const percentOfProject =
      totalProject > 0 ? (totalHoras / totalProject) * 100 : 0
    const bp = bpMap.get(bpId) ?? null

    // BP's contracted hours (capacidad), per month — same resolution as
    // `valorHoraBPForMonth`. Resolved inside the month loop below.
    const capBpForMes = (mes: number) =>
      bp ? capacidadBPForMonth(bp, capacidades, mes) : HOURS_PER_MONTH
    // Cost = Σ horas[mes] × (sueldo[mes] / cap_bp). Sueldo varies per month.
    const sueldoByMes = new Map<number, number>()
    let totalSueldo = 0
    for (const s of sueldos) {
      if (String(s.bp_id) !== bpId) continue
      sueldoByMes.set(s.mes, num(s.sueldo))
      totalSueldo += num(s.sueldo)
    }
    const costosPorMes = new Array(12).fill(0) as number[]
    const ingresosPorMes = new Array(12).fill(0) as number[]
    const ratePerHourBpPorMes = new Array(12).fill(0) as number[]
    for (let i = 0; i < 12; i++) {
      const horas = horasPorMes[i]
      const sueldo = sueldoByMes.get(i + 1) ?? 0
      const capBp = capBpForMes(i + 1)
      const rateBp = capBp > 0 && sueldo > 0 ? sueldo / capBp : 0
      ratePerHourBpPorMes[i] = rateBp
      costosPorMes[i] = horas * rateBp
      // Ingreso de referencia per month: BP's hours × project rate for that month.
      ingresosPorMes[i] = horas * ratePerHourProyectoPorMes[i]
    }
    const costosAnuales = costosPorMes.reduce((s, x) => s + x, 0)
    const ingresosAnuales = ingresosPorMes.reduce((s, x) => s + x, 0)
    const marginPercent =
      ingresosAnuales > 0
        ? ((ingresosAnuales - costosAnuales) / ingresosAnuales) * 100
        : 0
    const estado: BPProjectEstado =
      marginPercent > 20 ? 'rentable' : marginPercent > 0 ? 'neutral' : 'perdida'
    // Equivalent to Σ horas × rate / Σ horas (weighted avg by hours).
    const ratePerHourBpAvg = totalHoras > 0 ? costosAnuales / totalHoras : 0

    rows.push({
      bp,
      bp_id: bpId,
      bp_name: bp?.nombre ?? 'BP desconocido',
      totalHoras,
      horasPorMes,
      percentOfProject,
      totalSueldo,
      ratePerHourProyecto,
      ratePerHourProyectoPorMes,
      ratePerHourBpAvg,
      ratePerHourBpPorMes,
      ingresosAnuales,
      ingresosPorMes,
      costosAnuales,
      costosPorMes,
      marginPercent,
      estado,
    })
  }
  rows.sort((a, b) => b.totalHoras - a.totalHoras)
  return rows
}

/**
 * Returns the per-BP-on-project margin breakdown for one BP. Useful when
 * you have the entities individually and don't want to build the full
 * project map. The `año` parameter is accepted for API symmetry but
 * currently ignored — the schema has no year scope yet, so we aggregate
 * across whatever data exists.
 */
export function calculateBPProjectMargin(
  proyecto: Proyecto,
  bp: BrandPartner,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  _año?: number,
  capacidades: CapacidadMensual[] = []
): {
  totalHoras: number
  horasPorMes: number[]
  ratePerHourProyecto: number
  ratePerHourBpAvg: number
  ingresosAnuales: number
  costosAnuales: number
  marginPercent: number
  estado: BPProjectEstado
} {
  void _año
  const own = asignaciones.filter(
    (a) => same(a.proyecto_id, proyecto.id) && same(a.bp_id, bp.id)
  )
  const horasPorMes = new Array(12).fill(0) as number[]
  for (const a of own) {
    const idx = a.mes - 1
    if (idx >= 0 && idx < 12) horasPorMes[idx] += num(a.horas)
  }
  const totalHoras = horasPorMes.reduce((s, x) => s + x, 0)
  const ratePerHourProyecto =
    valorHoraProyecto(proyecto)
  const ingresosAnuales = totalHoras * ratePerHourProyecto

  // BP's contracted hours (cap), per month. Matches `valorHoraBPForMonth`.
  const sueldoByMes = new Map<number, number>()
  for (const s of sueldos) {
    if (same(s.bp_id, bp.id)) sueldoByMes.set(s.mes, num(s.sueldo))
  }
  let costosAnuales = 0
  for (let i = 0; i < 12; i++) {
    const horas = horasPorMes[i]
    const sueldo = sueldoByMes.get(i + 1) ?? 0
    const capBp = capacidadBPForMonth(bp, capacidades, i + 1)
    costosAnuales += horas * (capBp > 0 ? sueldo / capBp : 0)
  }
  const marginPercent =
    ingresosAnuales > 0
      ? ((ingresosAnuales - costosAnuales) / ingresosAnuales) * 100
      : 0
  const estado: BPProjectEstado =
    marginPercent > 20 ? 'rentable' : marginPercent > 0 ? 'neutral' : 'perdida'
  const ratePerHourBpAvg = totalHoras > 0 ? costosAnuales / totalHoras : 0

  return {
    totalHoras,
    horasPorMes,
    ratePerHourProyecto,
    ratePerHourBpAvg,
    ingresosAnuales,
    costosAnuales,
    marginPercent,
    estado,
  }
}

export interface BPProjectBreakdown {
  proyecto: Proyecto | null
  proyecto_id: string
  proyecto_name: string
  /** Sum of hours this BP logged on the project across the year. */
  totalHoras: number
  horasPorMes: number[]
  /** % of the BP's total hours that went to this project. */
  percentOfBp: number
  /** $/h proyecto = honorarios/160 (0 if proyecto is missing). */
  rateProyecto: number
}

/**
 * Group `asignaciones` by project for a given BP, with month-by-month hours
 * and the project's % share of the BP's total hours.
 */
export function buildProjectsForBp(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  proyectos: Proyecto[]
): BPProjectBreakdown[] {
  const own = asignaciones.filter((a) => same(a.bp_id, bp.id))
  const totalBp = own.reduce((s, a) => s + num(a.horas), 0)
  const projectMap = new Map(proyectos.map((p) => [String(p.id), p]))

  const byProject = new Map<string, Asignacion[]>()
  for (const a of own) {
    const k = String(a.proyecto_id)
    let list = byProject.get(k)
    if (!list) {
      list = []
      byProject.set(k, list)
    }
    list.push(a)
  }

  const rows: BPProjectBreakdown[] = []
  for (const [pid, asigs] of byProject.entries()) {
    const horasPorMes = new Array(12).fill(0) as number[]
    for (const a of asigs) {
      const idx = a.mes - 1
      if (idx >= 0 && idx < 12) horasPorMes[idx] += num(a.horas)
    }
    const totalHoras = horasPorMes.reduce((s, x) => s + x, 0)
    const percentOfBp = totalBp > 0 ? (totalHoras / totalBp) * 100 : 0
    const proyecto = projectMap.get(pid) ?? null
    const rateProyecto = proyecto
      ? valorHoraProyecto(proyecto)
      : 0
    rows.push({
      proyecto,
      proyecto_id: pid,
      proyecto_name: proyecto?.nombre ?? 'Proyecto desconocido',
      totalHoras,
      horasPorMes,
      percentOfBp,
      rateProyecto,
    })
  }
  rows.sort((a, b) => b.totalHoras - a.totalHoras)
  return rows
}

/** Top-level annual KPIs for the Brand Partners dashboard. */
export interface BPsAnnualKpis {
  totalBps: number
  avgSalary: number
  avgUtilization: number
  withoutAssignments: number
}

export function calculateBPsAnnualKpis(
  brandPartners: BrandPartner[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[]
): BPsAnnualKpis {
  const totalBps = brandPartners.length
  const allSueldos = sueldos.map((s) => num(s.sueldo)).filter((v) => v > 0)
  const avgSalary =
    allSueldos.length === 0
      ? 0
      : allSueldos.reduce((s, x) => s + x, 0) / allSueldos.length
  const annual = summarizeBPsAnnual(brandPartners, asignaciones, sueldos)
  const avgUtilization =
    annual.length === 0
      ? 0
      : annual.reduce((s, x) => s + x.avgUtilization, 0) / annual.length
  const withoutAssignments = annual.filter((x) => x.withoutAssignments).length
  return { totalBps, avgSalary, avgUtilization, withoutAssignments }
}

// ---------------------------------------------------------------------------
// BP-centric "Horas" view (utilization)
// ---------------------------------------------------------------------------

const MONTHS_ALL = Array.from({ length: 12 }, (_, i) => i + 1)

/** One row of `horas_contratadas`: the BP's contracted capacity for a
 *  given month. */
export interface CapacidadMensual {
  bp_id: Id
  mes: number
  horas: number
}

/**
 * The BP's contracted capacity for `mes`. Resolution order:
 *   1. the `horas_contratadas` row for (bp, mes) — the source of truth,
 *   2. the scalar `bp.capacidad_horas_mensual` (legacy / not-yet-migrated),
 *   3. `HOURS_PER_MONTH`.
 *
 * A row holding 0 is honoured as a deliberate "no capacity this month"
 * rather than falling through to the scalar — that's how you model a BP
 * whose dedication drops to nothing without deleting the row.
 */
export function capacidadBPForMonth(
  bp: BrandPartner,
  capacidades: CapacidadMensual[],
  mes: number
): number {
  const row = capacidades.find(
    (c) => c.mes === mes && same(c.bp_id, bp.id)
  )
  if (row) return num(row.horas)
  if (bp.capacidad_horas_mensual != null && num(bp.capacidad_horas_mensual) > 0) {
    return num(bp.capacidad_horas_mensual)
  }
  return HOURS_PER_MONTH
}

/** Per-BP per-month sueldo lookup with fallback. */
function pickSueldoMensual(
  bp: BrandPartner,
  sueldos: Sueldo[],
  mes: number
): number {
  const row = sueldos.find((s) => s.mes === mes && same(s.bp_id, bp.id))
  if (row) return num(row.sueldo)
  return num(bp.sueldo_mensual)
}

/** Hourly cost for a BP in a given mes: sueldo / capacidad. */
function valorHoraBPForMonth(
  bp: BrandPartner,
  sueldos: Sueldo[],
  mes: number,
  capacidades: CapacidadMensual[] = []
): number {
  const sueldo = pickSueldoMensual(bp, sueldos, mes)
  const cap = capacidadBPForMonth(bp, capacidades, mes)
  if (cap <= 0 || sueldo <= 0) return 0
  return sueldo / cap
}

/** Per-month project hourly value with fallback.
 *
 * - `precio` prefers the booked honorario row for that mes, falls back
 *   to the cached `proyecto.precio_mensual` scalar.
 * - `horas` prefers the per-month row from `horas_proyecto` (passed in
 *   via `horasMensuales`), falls back to the scalar
 *   `proyecto.horas_requeridas_mensual`, then to 160. */
function valorHoraProyectoForMonth(
  proyecto: Proyecto,
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[],
  mes: number,
  horasMensuales: { proyecto_id: Id; mes: number; horas: number }[] = [],
  horasAsignadasTotal?: number // total hours assigned to this project this month
): number {
  const hRow = honorariosMensuales.find(
    (h) => h.mes === mes && same(h.proyecto_id, proyecto.id)
  )
  const precio = hRow ? num(hRow.honorarios) : num(proyecto.precio_mensual)
  const horasRow = horasMensuales.find(
    (h) => h.mes === mes && same(h.proyecto_id, proyecto.id)
  )
  const horasPresupuestadas =
    horasRow && num(horasRow.horas) > 0
      ? num(horasRow.horas)
      : proyecto.horas_requeridas_mensual != null
        ? num(proyecto.horas_requeridas_mensual)
        : HOURS_PER_MONTH
  // Cap: if more hours were assigned than budgeted, the rate adjusts down
  // so the total ingreso reference stays at the fixed honorario amount.
  const horas =
    horasAsignadasTotal != null && horasAsignadasTotal > horasPresupuestadas
      ? horasAsignadasTotal
      : horasPresupuestadas
  if (precio <= 0 || horas <= 0) return 0
  return precio / horas
}

/** Quoted/budgeted hours (HC) for a project in `mes`.
 *
 * Prefers the per-month row from `horas_proyecto` (via `horasMensuales`),
 * falls back to the scalar `proyecto.horas_requeridas_mensual`, then to 160
 * — but ONLY when the scalar is null. Unlike `valorHoraProyectoForMonth`
 * this never caps by assigned hours: HC must stay independent of HA so the
 * commercial difference (HC - HA) can be negative when over-assigned. */
function horasCotizadasProyectoForMonth(
  proyecto: Proyecto,
  horasMensuales: { proyecto_id: Id; mes: number; horas: number }[],
  mes: number
): number {
  const row = horasMensuales.find(
    (h) => h.mes === mes && same(h.proyecto_id, proyecto.id)
  )
  if (row && num(row.horas) > 0) return num(row.horas)
  if (proyecto.horas_requeridas_mensual != null) {
    return num(proyecto.horas_requeridas_mensual)
  }
  return HOURS_PER_MONTH
}

export interface BPProjectHorasRow {
  proyecto_id: Id
  proyecto_name: string
  horas: number
}

export interface BPHorasMonthRow {
  bp: BrandPartner
  /** Contracted capacity for this mes: the `horas_contratadas` row, else
   *  the scalar `capacidad_horas_mensual`, else 160. */
  horasContratadas: number
  /** Σ horas asignadas in `mes`. */
  horasAsignadas: number
  /**
   * contratadas - asignadas, SIGNED. A negative value means the BP is
   * over-assigned (sold beyond capacity) — real information, so it is
   * surfaced as-is instead of being clamped to 0.
   */
  horasLibres: number
  /** max(0, horasLibres) — idle capacity only. Over-assignment doesn't
   *  create negative ociosidad, so the cost / annual idle aggregates use
   *  this instead of the signed `horasLibres`. */
  horasOciosas: number
  /** Idle cost in pesos: horasOciosas × (sueldo[mes] / capacidad). What the
   *  agency pays for unassigned capacity this month. */
  costoHorasLibres: number
  /** asignadas / contratadas × 100 (0 if no capacity). */
  ocupacion: number
  /** Per-project breakdown. */
  byProject: BPProjectHorasRow[]
}

export function bpHorasMonthRow(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  proyectos: Proyecto[],
  mes: number,
  sueldos: Sueldo[] = [],
  capacidades: CapacidadMensual[] = []
): BPHorasMonthRow {
  // Months outside the BP's active window [ingreso, egreso] contribute
  // zero capacity / hours. Without sueldos passed in, only the ingreso
  // bound is checked (active BPs are unaffected; inactives without
  // history collapse to 1 month).
  if (!inActiveWindow(bp, mes, sueldos)) {
    return {
      bp,
      horasContratadas: 0,
      horasAsignadas: 0,
      horasLibres: 0,
      horasOciosas: 0,
      costoHorasLibres: 0,
      ocupacion: 0,
      byProject: [],
    }
  }

  // Per-month capacity: the `horas_contratadas` row for this mes, then the
  // scalar, then 160. A BP whose dedication changes mid-year is modelled by
  // the rows, not by the scalar.
  const horasContratadas = capacidadBPForMonth(bp, capacidades, mes)

  const own = asignaciones.filter(
    (a) => a.mes === mes && same(a.bp_id, bp.id)
  )
  const horasAsignadas = own.reduce((s, a) => s + num(a.horas), 0)
  // Signed: over-assignment shows as a negative "libres" in the table.
  const horasLibres = horasContratadas - horasAsignadas
  const horasOciosas = Math.max(0, horasLibres)
  // Value the idle hours at the BP's hourly cost (sueldo[mes] / capacidad).
  // Uses the clamped value — being over-assigned costs nothing extra.
  const costoHorasLibres =
    horasOciosas * valorHoraBPForMonth(bp, sueldos, mes, capacidades)
  const ocupacion =
    horasContratadas > 0 ? (horasAsignadas / horasContratadas) * 100 : 0

  // Group asignaciones by project (a BP could have multiple rows per
  // project, though in practice not; we sum just in case). Skip zero-hour
  // rows so projects with stale `0h` asignaciones for the mes don't show
  // up in the per-month detail tables.
  const byProjMap = new Map<string, number>()
  for (const a of own) {
    const h = num(a.horas)
    if (h <= 0) continue
    const key = String(a.proyecto_id)
    byProjMap.set(key, (byProjMap.get(key) ?? 0) + h)
  }
  const projById = new Map(proyectos.map((p) => [String(p.id), p]))
  const byProject: BPProjectHorasRow[] = Array.from(byProjMap.entries())
    .map(([pid, horas]) => ({
      proyecto_id: pid,
      proyecto_name: projById.get(pid)?.nombre ?? '—',
      horas,
    }))
    .sort((a, b) => b.horas - a.horas)

  return {
    bp,
    horasContratadas,
    horasAsignadas,
    horasLibres,
    horasOciosas,
    costoHorasLibres,
    ocupacion,
    byProject,
  }
}

/**
 * Aggregates `bpHorasMonthRow` over an arbitrary set of months — the
 * building block for the quarterly (Q1..Q4) scope. Returns the same shape
 * as a single-month row so the tables render either scope unchanged.
 *
 * Only months where the BP actually has assigned hours contribute
 * capacity, mirroring the annual rule: never project contracted hours
 * into months with no data. With a single mes this is equivalent to
 * `bpHorasMonthRow` for every row the tables actually display (they all
 * filter on `horasAsignadas > 0`).
 */
export function bpHorasPeriodRow(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  proyectos: Proyecto[],
  meses: number[],
  sueldos: Sueldo[] = [],
  capacidades: CapacidadMensual[] = []
): BPHorasMonthRow {
  const rows = meses.map((m) =>
    bpHorasMonthRow(bp, asignaciones, proyectos, m, sueldos, capacidades)
  )
  const active = rows.filter((r) => r.horasAsignadas > 0)
  const horasContratadas = active.reduce((s, r) => s + r.horasContratadas, 0)
  const horasAsignadas = active.reduce((s, r) => s + r.horasAsignadas, 0)
  // Signed net across the period, so an over-assigned month offsets an
  // idle one — that IS the commercial reading of "libres" for a quarter.
  const horasLibres = horasContratadas - horasAsignadas
  // Ociosidad never nets: idle hours in one month stay sellable even if
  // another month was over-assigned.
  const horasOciosas = active.reduce((s, r) => s + r.horasOciosas, 0)
  const costoHorasLibres = active.reduce((s, r) => s + r.costoHorasLibres, 0)
  const ocupacion =
    horasContratadas > 0 ? (horasAsignadas / horasContratadas) * 100 : 0

  const byProjMap = new Map<string, BPProjectHorasRow>()
  for (const r of active) {
    for (const p of r.byProject) {
      const key = String(p.proyecto_id)
      const prev = byProjMap.get(key)
      if (prev) prev.horas += p.horas
      else byProjMap.set(key, { ...p })
    }
  }
  const byProject = Array.from(byProjMap.values()).sort(
    (a, b) => b.horas - a.horas
  )

  return {
    bp,
    horasContratadas,
    horasAsignadas,
    horasLibres,
    horasOciosas,
    costoHorasLibres,
    ocupacion,
    byProject,
  }
}

export interface BPHorasYearRow {
  bp: BrandPartner
  /** Length 12, indexed 0..11 (mes = i+1). */
  byMonth: BPHorasMonthRow[]
}

export function bpHorasYear(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  proyectos: Proyecto[],
  sueldos: Sueldo[] = [],
  capacidades: CapacidadMensual[] = []
): BPHorasYearRow {
  return {
    bp,
    byMonth: MONTHS_ALL.map((m) =>
      bpHorasMonthRow(bp, asignaciones, proyectos, m, sueldos, capacidades)
    ),
  }
}

// ---------------------------------------------------------------------------
// BP-centric "Rentabilidad" view (margen en pesos)
// ---------------------------------------------------------------------------

export interface BPProjectRentabilidadRow {
  proyecto_id: Id
  proyecto_name: string
  horas: number
  valorHoraProyecto: number
  valorHoraBP: number
  ingreso: number
  costo: number
  margen: number
}

export interface BPRentabilidadMonthRow {
  bp: BrandPartner
  /** sueldo for the month (sueldos table → bp.sueldo_mensual). */
  sueldoMensual: number
  /** Σ ingreso across projects this BP touched in `mes`. */
  ingresoCotizado: number
  /** Σ costo (valor/h BP × horas) across projects in `mes`. Vicky's
   *  "sueldo ocupado": what the hours actually assigned cost. */
  costo: number
  /** "Sueldo ocioso" = sueldoMensual − costo. The slice of the salary not
   *  backed by assigned hours. Negative when the BP is over-assigned. */
  sueldoOcioso: number
  /** ingreso - costo. Vicky's "diferencia cubierto vs ocupado". */
  margen: number
  /** margen / ingreso × 100 (0 if no ingreso). */
  margenPercent: number
  /** "Cobertura salarial" = costo - sueldoMensual:
   *   negative → projects didn't cover the salary (we're subsidising)
   *   positive → projects recovered more than the salary (good). */
  coberturaSalarial: number
  /** "Diferencia por cálculo comercial" attributable to this BP, in hours:
   *  Σ_proyecto (HC_bp - HA_bp), where HC_bp prorates the project's quoted
   *  hours by the BP's share of the project's assigned hours that month. */
  diferenciaComercialHoras: number
  /** The same difference valued at each project's per-hour rate:
   *  Σ_proyecto (HC_bp - HA_bp) × rate_proyecto[mes]. */
  diferenciaComercial: number
  /** Per-project breakdown. */
  byProject: BPProjectRentabilidadRow[]
}

export function bpRentabilidadMonthRow(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  proyectos: Proyecto[],
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[],
  mes: number,
  horasMensuales: { proyecto_id: Id; mes: number; horas: number }[] = [],
  capacidades: CapacidadMensual[] = []
): BPRentabilidadMonthRow {
  // Outside the BP's active window — no costo, no ingreso.
  if (!inActiveWindow(bp, mes, sueldos)) {
    return {
      bp,
      sueldoMensual: 0,
      ingresoCotizado: 0,
      costo: 0,
      sueldoOcioso: 0,
      margen: 0,
      margenPercent: 0,
      coberturaSalarial: 0,
      diferenciaComercialHoras: 0,
      diferenciaComercial: 0,
      byProject: [],
    }
  }

  const sueldoMensual = pickSueldoMensual(bp, sueldos, mes)
  const valorHoraBP = valorHoraBPForMonth(bp, sueldos, mes, capacidades)

  const own = asignaciones.filter(
    (a) => a.mes === mes && same(a.bp_id, bp.id)
  )

  const projById = new Map(proyectos.map((p) => [String(p.id), p]))
  const byProjMap = new Map<string, { proyecto: Proyecto; horas: number }>()
  for (const a of own) {
    const h = num(a.horas)
    if (h <= 0) continue
    const proyecto = projById.get(String(a.proyecto_id))
    if (!proyecto) continue
    const key = String(a.proyecto_id)
    const prev = byProjMap.get(key)
    byProjMap.set(key, {
      proyecto,
      horas: (prev?.horas ?? 0) + h,
    })
  }

  // For rate capping: total hours assigned per project this month (all BPs)
  const horasAsigPorProyecto = new Map<string, number>()
  for (const a of asignaciones) {
    if (a.mes !== mes) continue
    const key = String(a.proyecto_id)
    horasAsigPorProyecto.set(key, (horasAsigPorProyecto.get(key) ?? 0) + num(a.horas))
  }

  const byProject: BPProjectRentabilidadRow[] = Array.from(byProjMap.values())
    .map(({ proyecto, horas }) => {
      const vhp = valorHoraProyectoForMonth(
        proyecto,
        honorariosMensuales,
        mes,
        horasMensuales,
        horasAsigPorProyecto.get(String(proyecto.id)) // total project hours this month
      )
      const ingreso = vhp * horas
      const costo = valorHoraBP * horas
      return {
        proyecto_id: proyecto.id,
        proyecto_name: proyecto.nombre,
        horas,
        valorHoraProyecto: vhp,
        valorHoraBP,
        ingreso,
        costo,
        margen: ingreso - costo,
      }
    })
    .sort((a, b) => b.margen - a.margen)

  // Commercial difference (HC - HA) attributed to this BP. The project's
  // quoted hours (HC_proyecto) are prorated by the BP's share of the
  // project's total assigned hours that month, then valued at the project
  // rate. Estimation error, kept apart from idle-capacity math.
  let diferenciaComercialHoras = 0
  let diferenciaComercial = 0
  for (const { proyecto, horas } of byProjMap.values()) {
    const haProyectoTotal = horasAsigPorProyecto.get(String(proyecto.id)) ?? 0
    const hcProyecto = horasCotizadasProyectoForMonth(
      proyecto,
      horasMensuales,
      mes
    )
    const hcBp = haProyectoTotal > 0 ? hcProyecto * (horas / haProyectoTotal) : 0
    const diffHoras = hcBp - horas
    const vhp = valorHoraProyectoForMonth(
      proyecto,
      honorariosMensuales,
      mes,
      horasMensuales,
      haProyectoTotal
    )
    diferenciaComercialHoras += diffHoras
    diferenciaComercial += diffHoras * vhp
  }

  const ingresoCotizado = byProject.reduce((s, x) => s + x.ingreso, 0)
  const costo = byProject.reduce((s, x) => s + x.costo, 0)
  const margen = ingresoCotizado - costo
  const margenPercent =
    ingresoCotizado > 0 ? (margen / ingresoCotizado) * 100 : 0
  // Cobertura salarial: positive when the BP's cotized revenue is at
  // least their salary (projects pay for the BP); negative when the
  // agency is absorbing the difference. Compares ingreso vs. sueldo —
  // NOT costo vs. sueldo (that would measure utilization, not coverage).
  const coberturaSalarial = ingresoCotizado - sueldoMensual
  // Sueldo ocioso: the part of the salary the assigned hours don't consume.
  const sueldoOcioso = sueldoMensual - costo

  return {
    bp,
    sueldoMensual,
    ingresoCotizado,
    costo,
    sueldoOcioso,
    margen,
    margenPercent,
    coberturaSalarial,
    diferenciaComercialHoras,
    diferenciaComercial,
    byProject,
  }
}

/**
 * Aggregates `bpRentabilidadMonthRow` over an arbitrary set of months —
 * the building block for the quarterly (Q1..Q4) scope. Same shape as a
 * single-month row so the tables render either scope unchanged.
 *
 * Sueldo is only summed over months where the BP actually has projects
 * assigned, matching the annual aggregate: months with no activity would
 * otherwise inflate the salary while the ingreso stays at 0.
 */
export function bpRentabilidadPeriodRow(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  proyectos: Proyecto[],
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[],
  meses: number[],
  horasMensuales: { proyecto_id: Id; mes: number; horas: number }[] = [],
  capacidades: CapacidadMensual[] = []
): BPRentabilidadMonthRow {
  const rows = meses.map((m) =>
    bpRentabilidadMonthRow(
      bp,
      asignaciones,
      sueldos,
      proyectos,
      honorariosMensuales,
      m,
      horasMensuales,
      capacidades
    )
  )
  const active = rows.filter((r) => r.byProject.length > 0)
  const sueldoMensual = active.reduce((s, r) => s + r.sueldoMensual, 0)
  const ingresoCotizado = active.reduce((s, r) => s + r.ingresoCotizado, 0)
  const costo = active.reduce((s, r) => s + r.costo, 0)
  const margen = ingresoCotizado - costo
  const margenPercent =
    ingresoCotizado > 0 ? (margen / ingresoCotizado) * 100 : 0
  const coberturaSalarial = ingresoCotizado - sueldoMensual
  const sueldoOcioso = sueldoMensual - costo
  const diferenciaComercialHoras = active.reduce(
    (s, r) => s + r.diferenciaComercialHoras,
    0
  )
  const diferenciaComercial = active.reduce(
    (s, r) => s + r.diferenciaComercial,
    0
  )

  const byProjMap = new Map<string, BPProjectRentabilidadRow>()
  for (const r of active) {
    for (const p of r.byProject) {
      const key = String(p.proyecto_id)
      const prev = byProjMap.get(key)
      if (!prev) {
        byProjMap.set(key, { ...p })
        continue
      }
      prev.horas += p.horas
      prev.ingreso += p.ingreso
      prev.costo += p.costo
      prev.margen += p.margen
      // Rates become hour-weighted averages across the period.
      prev.valorHoraProyecto =
        prev.horas > 0 ? prev.ingreso / prev.horas : prev.valorHoraProyecto
      prev.valorHoraBP =
        prev.horas > 0 ? prev.costo / prev.horas : prev.valorHoraBP
    }
  }
  const byProject = Array.from(byProjMap.values()).sort(
    (a, b) => b.margen - a.margen
  )

  return {
    bp,
    sueldoMensual,
    ingresoCotizado,
    costo,
    sueldoOcioso,
    margen,
    margenPercent,
    coberturaSalarial,
    diferenciaComercialHoras,
    diferenciaComercial,
    byProject,
  }
}

export interface BPRentabilidadYearRow {
  bp: BrandPartner
  /** Length 12, indexed 0..11 (mes = i+1). */
  byMonth: BPRentabilidadMonthRow[]
}

export function bpRentabilidadYear(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  proyectos: Proyecto[],
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[],
  horasMensuales: { proyecto_id: Id; mes: number; horas: number }[] = [],
  capacidades: CapacidadMensual[] = []
): BPRentabilidadYearRow {
  return {
    bp,
    byMonth: MONTHS_ALL.map((m) =>
      bpRentabilidadMonthRow(
        bp,
        asignaciones,
        sueldos,
        proyectos,
        honorariosMensuales,
        m,
        horasMensuales,
        capacidades
      )
    ),
  }
}

// ---------------------------------------------------------------------------
// Annual aggregates for the BP dashboard tables
// ---------------------------------------------------------------------------

export interface BPHorasAnnualAggregate {
  bp: BrandPartner
  /** Σ capacidad across 12 months. */
  totalContratadas: number
  /** Σ horas asignadas across 12 months. */
  totalAsignadas: number
  /** contratadas - asignadas (≥0). */
  totalLibres: number
  /** Σ (horasLibres_m × valorHora_m) over active months — the idle cost in
   *  pesos, summed month-by-month so monthly sueldo variation is respected
   *  (NOT totalLibres × an average rate). */
  costoHorasLibres: number
  /** weighted: totalAsignadas / totalContratadas × 100. */
  ocupacionPromedio: number
  /** Per-month horas asignadas, indexed 0..11. */
  byMonth: number[]
}

export function bpHorasAnnualAggregate(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  proyectos: Proyecto[],
  sueldos: Sueldo[] = [],
  capacidades: CapacidadMensual[] = []
): BPHorasAnnualAggregate {
  const year = bpHorasYear(bp, asignaciones, proyectos, sueldos, capacidades)
  const mesIngreso = getMesIngreso(bp)
  const mesEgreso = getMesEgreso(bp, sueldos)

  // Annual `Contratadas` only counts months (in window) where this BP
  // actually has at least one asignacion loaded — so future / empty
  // months don't inflate the denominator. Per-month rows stay full
  // capacidad; this rule applies only to the annual aggregate.
  const monthsWithAsig = new Set<number>()
  for (const a of asignaciones) {
    if (!same(a.bp_id, bp.id)) continue
    const m = Number(a.mes)
    if (!Number.isFinite(m) || m < mesIngreso || m > mesEgreso) continue
    if (num(a.horas) <= 0) continue
    monthsWithAsig.add(m)
  }
  // Capacity now varies per month, so the annual total is the sum over the
  // active months — not `months × a single scalar`.
  let totalContratadas = 0
  for (const m of monthsWithAsig) {
    totalContratadas += year.byMonth[m - 1]?.horasContratadas ?? 0
  }
  const totalAsignadas = year.byMonth.reduce(
    (s, m) => s + m.horasAsignadas,
    0
  )
  // Idle hours + idle cost, both summed month-by-month over active months.
  // Idle does NOT net across months: a BP over-assigned in one month and
  // idle in another still has real, sellable idle hours — so we sum
  // `max(0, contratadas_m − asignadas_m)` per month rather than the annual
  // net. This keeps `totalLibres` consistent with `costoHorasLibres` and
  // with the monthly view. (Intentionally changes the number for
  // over-assigned BPs vs the old net calculation.)
  let totalLibres = 0
  let costoHorasLibres = 0
  for (const m of monthsWithAsig) {
    const row = year.byMonth[m - 1]
    totalLibres += row?.horasOciosas ?? 0
    costoHorasLibres += row?.costoHorasLibres ?? 0
  }
  const ocupacionPromedio =
    totalContratadas > 0 ? (totalAsignadas / totalContratadas) * 100 : 0
  return {
    bp,
    totalContratadas,
    totalAsignadas,
    totalLibres,
    costoHorasLibres,
    ocupacionPromedio,
    byMonth: year.byMonth.map((m) => m.horasAsignadas),
  }
}

export interface BPRentabilidadAnnualAggregate {
  bp: BrandPartner
  /** Σ ingreso across 12 months. */
  totalIngreso: number
  /** Σ costo across 12 months. */
  totalCosto: number
  /** ingreso - costo. */
  totalMargen: number
  /** margen / ingreso × 100. */
  margenPercent: number
  /** Mean monthly sueldo, restricted to months where the BP had at least
   *  one hour assigned (so empty / future months don't drag the avg). */
  sueldoPromedio: number
  /** Σ sueldoMensual across months where the BP had at least one hour
   *  assigned — keeps the annual sueldo aligned with annual ingreso. */
  totalSueldo: number
  /** totalIngreso − totalSueldo. */
  totalCoberturaSalarial: number
  /** totalSueldo − totalCosto ("sueldo ocioso" del año). */
  totalSueldoOcioso: number
  /** Σ diferenciaComercialHoras across the 12 months. */
  totalDiferenciaComercialHoras: number
  /** Σ diferenciaComercial (en plata) across the 12 months. */
  totalDiferenciaComercial: number
  /** Per-month margen, indexed 0..11. */
  byMonth: number[]
}

export function bpRentabilidadAnnualAggregate(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  proyectos: Proyecto[],
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[],
  horasMensuales: { proyecto_id: Id; mes: number; horas: number }[] = [],
  capacidades: CapacidadMensual[] = []
): BPRentabilidadAnnualAggregate {
  const year = bpRentabilidadYear(
    bp,
    asignaciones,
    sueldos,
    proyectos,
    honorariosMensuales,
    horasMensuales,
    capacidades
  )
  const totalIngreso = year.byMonth.reduce((s, m) => s + m.ingresoCotizado, 0)
  const totalCosto = year.byMonth.reduce((s, m) => s + m.costo, 0)
  const totalMargen = totalIngreso - totalCosto
  const margenPercent = totalIngreso > 0 ? (totalMargen / totalIngreso) * 100 : 0
  // Months where the BP has at least one hour assigned. Salary aggregations
  // are restricted to this set so months without activity don't inflate the
  // annual sueldo while ingreso stays at 0 (would otherwise show a
  // misleading negative coverage).
  const monthsWithAsig = new Set<number>()
  for (const a of asignaciones) {
    if (!same(a.bp_id, bp.id)) continue
    const m = Number(a.mes)
    if (!Number.isFinite(m) || m < 1 || m > 12) continue
    if (num(a.horas) <= 0) continue
    monthsWithAsig.add(m)
  }
  const sueldosForActiveMonths = year.byMonth
    .map((row, i) => ({ mes: i + 1, sueldo: row.sueldoMensual }))
    .filter(({ mes, sueldo }) => monthsWithAsig.has(mes) && sueldo > 0)
  const sueldoPromedio =
    sueldosForActiveMonths.length === 0
      ? 0
      : sueldosForActiveMonths.reduce((s, x) => s + x.sueldo, 0) /
        sueldosForActiveMonths.length
  const totalSueldo = year.byMonth.reduce(
    (s, row, i) => (monthsWithAsig.has(i + 1) ? s + row.sueldoMensual : s),
    0
  )
  // ingreso − sueldo: how much of the salary was covered by the cotized
  // revenue this BP generated across the year.
  const totalCoberturaSalarial = totalIngreso - totalSueldo
  // Commercial difference summed month-by-month (each month already 0 when
  // the BP has no projects / is out of window), so no extra filtering needed.
  const totalDiferenciaComercialHoras = year.byMonth.reduce(
    (s, m) => s + m.diferenciaComercialHoras,
    0
  )
  const totalDiferenciaComercial = year.byMonth.reduce(
    (s, m) => s + m.diferenciaComercial,
    0
  )
  return {
    bp,
    totalIngreso,
    totalCosto,
    totalMargen,
    margenPercent,
    sueldoPromedio,
    totalSueldo,
    totalCoberturaSalarial,
    totalSueldoOcioso: totalSueldo - totalCosto,
    totalDiferenciaComercialHoras,
    totalDiferenciaComercial,
    byMonth: year.byMonth.map((m) => m.margen),
  }
}
