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

/** BP's per-hour cost: sueldo_mensual / capacidad_horas_mensual.
 * Capacity defaults to 160 if not set. Returns 0 when no sueldo on file. */
export function costoHoraBP(bp: BrandPartner): number {
  const sueldo = bp.sueldo_mensual != null ? Number(bp.sueldo_mensual) : 0
  const cap =
    bp.capacidad_horas_mensual != null
      ? Number(bp.capacidad_horas_mensual)
      : HOURS_PER_MONTH
  if (!Number.isFinite(sueldo) || sueldo <= 0) return 0
  if (!Number.isFinite(cap) || cap <= 0) return 0
  return sueldo / cap
}

/** Per-hour difference (project value - BP cost). Positive = profit. */
export function diferenciaPorHora(p: Proyecto, bp: BrandPartner): number {
  return valorHoraProyecto(p) - costoHoraBP(bp)
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
  brandPartners: BrandPartner[]
): ProjectRentabilidadSummary {
  const own = asignaciones.filter((a) => same(a.proyecto_id, proyecto.id))
  const totalHoras = own.reduce((s, a) => s + num(a.horas), 0)
  const bpMap = new Map(brandPartners.map((bp) => [String(bp.id), bp]))
  const bpIds = new Set(own.map((a) => String(a.bp_id)))
  let weightedCost = 0
  for (const a of own) {
    const bp = bpMap.get(String(a.bp_id))
    if (!bp) continue
    weightedCost += costoHoraBP(bp) * num(a.horas)
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
  brandPartners: BrandPartner[]
): ProjectRentabilidadSummary[] {
  return proyectos.map((p) =>
    summarizeProjectRentabilidad(p, asignaciones, brandPartners)
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

// ---------------------------------------------------------------------------
// Top-level KPIs
// ---------------------------------------------------------------------------

/**
 * Booked monthly revenue: sum across all projects of what the project
 * "bills" that month. Reads from `proyecto_honorarios_mensuales` if rows
 * are provided; otherwise falls back to `proyecto.precio_mensual`
 * (or `honorarios_cotizador`) — the scalar billed-per-month value.
 *
 * NOTE: this is intentionally not "earned" revenue (hours × $/h). For an
 * Always-On contract you bill the same amount whether or not the BP
 * worked, so the dashboard surfaces the booked figure.
 *
 * Filters out projects with `status === 'finalizado'` so closed deals
 * stop contributing.
 */
export function calculateMonthlyRevenue(
  proyectos: Proyecto[],
  _asignaciones: Asignacion[], // kept for signature compat; not used.
  mes: number,
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[]
): number {
  void _asignaciones
  // Per-project booked amount for `mes`: prefer the per-month row, else
  // the project scalar.
  const byProyectoMes = new Map<string, number>()
  if (honorariosMensuales) {
    for (const h of honorariosMensuales) {
      if (h.mes === mes) {
        byProyectoMes.set(String(h.proyecto_id), num(h.honorarios))
      }
    }
  }
  return proyectos.reduce((acc, p) => {
    if ((p.status ?? '').toLowerCase() === 'finalizado') return acc
    const fromTable = byProyectoMes.get(String(p.id))
    const scalar =
      p.precio_mensual != null
        ? num(p.precio_mensual)
        : num(p.honorarios_cotizador)
    const value = fromTable !== undefined ? fromTable : scalar
    return acc + Math.max(0, value)
  }, 0)
}

/**
 * Cost of the BPs that worked this month — sum of full sueldos for any
 * BP that has at least one assignment in `mes`.
 *
 * Note: a BP with sueldo but no assignments contributes 0; a BP assigned
 * but with no sueldo row also contributes 0.
 */
export function calculateBPCosts(
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  mes: number
): number {
  const assignedBpIds = new Set(
    asignaciones.filter((a) => a.mes === mes).map((a) => String(a.bp_id))
  )
  return sueldos
    .filter((s) => s.mes === mes && assignedBpIds.has(String(s.bp_id)))
    .reduce((acc, s) => acc + num(s.sueldo), 0)
}

/**
 * Idle hours across the BP roster for the month. For each BP we compute
 * `max(0, 160 - Σ horas en ese mes)` and add them up. BPs missing entirely
 * from `brandPartners` are not counted.
 */
export function calculateIdleHours(
  brandPartners: BrandPartner[],
  asignaciones: Asignacion[],
  mes: number
): number {
  const usedByBp = new Map<string, number>()
  for (const a of asignaciones) {
    if (a.mes !== mes) continue
    const key = String(a.bp_id)
    usedByBp.set(key, (usedByBp.get(key) ?? 0) + num(a.horas))
  }
  return brandPartners.reduce((acc, bp) => {
    const used = usedByBp.get(String(bp.id)) ?? 0
    return acc + Math.max(0, HOURS_PER_MONTH - used)
  }, 0)
}

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
  /** Project's per-hour rate: honorarios / 160. */
  projectRate: number
  /** Mean of per-hour rates of the BPs assigned (sueldo / 160). */
  avgBpRate: number
  /** Earned revenue for this project in `mes`. */
  revenue: number
  /**
   * Project cost — sum of full sueldos of the BPs that worked here, per
   * spec. NOTE: this overstates total cost if a BP is split across
   * multiple projects, since the same sueldo will be counted in each.
   * Use only when you want a per-project view; do NOT sum across all
   * projects to derive company costs (use `calculateBPCosts` for that).
   */
  cost: number
  /** revenue - cost (in pesos). */
  marginAbsolute: number
  /**
   * Per-hour margin: (projectRate - avgBpRate) / projectRate * 100.
   * This is what we surface in the table because it ties cleanly to the
   * `$/h proyecto` and `$/h BP prom.` columns next to it.
   */
  marginPercent: number
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
  _sueldos: Sueldo[],
  mes: number,
  brandPartners?: BrandPartner[],
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[]
): ProjectMonthSummary {
  void _sueldos
  const own = asignaciones.filter(
    (a) => a.mes === mes && same(a.proyecto_id, proyecto.id)
  )
  const totalHoras = own.reduce((s, a) => s + num(a.horas), 0)
  const bpIds = Array.from(new Set(own.map((a) => String(a.bp_id))))
  const bps = bpIds.length

  // Effective project rate from the booked honorarios for this month
  // (honorarios / horas_requeridas). Falls back to the legacy scalar only
  // when no monthly row is provided at all.
  const projectRate = valorHoraProyectoForMonth(
    proyecto,
    honorariosMensuales ?? [],
    mes
  )

  // Per-BP rate via the profitability model (sueldo / capacidad).
  const bpsById = new Map(
    (brandPartners ?? []).map((bp) => [String(bp.id), bp])
  )
  const bpRateById = new Map<string, number>()
  for (const id of bpIds) {
    const bp = bpsById.get(id)
    bpRateById.set(id, bp ? costoHoraBP(bp) : 0)
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
  }
}

export function summarizeAllProjects(
  proyectos: Proyecto[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  mes: number,
  brandPartners?: BrandPartner[],
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[]
): ProjectMonthSummary[] {
  return proyectos.map((p) =>
    calculateProjectMargin(
      p,
      asignaciones,
      sueldos,
      mes,
      brandPartners,
      honorariosMensuales
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
// Asignacion row joins (used in /gestión/asignaciones)
// ---------------------------------------------------------------------------

export interface AsignacionJoinedRow {
  asignacion: Asignacion
  proyecto: Proyecto | null
  bp: BrandPartner | null
  sueldoRow: Sueldo | null
  /** Project per-hour rate: honorarios / 160 (0 when project unknown). */
  rateProyecto: number
  /** BP per-hour rate: sueldo / 160 (0 when no sueldo for that mes). */
  rateBP: number
  /** Per-hour margin: (rate_p - rate_bp) / rate_p * 100. */
  marginPercent: number
  /** Earned amount for this asignacion in pesos. */
  monto: number
}

/**
 * Join asignaciones with their proyecto / bp / sueldo rows. The sueldo is
 * matched on (bp_id, mes); if there's no matching row, rateBP is 0 and
 * the margin reflects "100% of the project rate" (meaning we can't price
 * this BP yet).
 */
export function joinAsignaciones(
  asignaciones: Asignacion[],
  proyectos: Proyecto[],
  brandPartners: BrandPartner[],
  sueldos: Sueldo[]
): AsignacionJoinedRow[] {
  const projectMap = new Map(proyectos.map((p) => [String(p.id), p]))
  const bpMap = new Map(brandPartners.map((b) => [String(b.id), b]))
  const sueldoMap = new Map(
    sueldos.map((s) => [`${String(s.bp_id)}::${s.mes}`, s])
  )
  return asignaciones.map((a) => {
    const proyecto = projectMap.get(String(a.proyecto_id)) ?? null
    const bp = bpMap.get(String(a.bp_id)) ?? null
    const sueldoRow = sueldoMap.get(`${String(a.bp_id)}::${a.mes}`) ?? null
    const rateProyecto = proyecto
      ? valorHoraProyecto(proyecto)
      : 0
    const rateBP = sueldoRow ? num(sueldoRow.sueldo) / HOURS_PER_MONTH : 0
    const marginPercent =
      rateProyecto > 0 ? ((rateProyecto - rateBP) / rateProyecto) * 100 : 0
    const monto = rateProyecto * num(a.horas)
    return {
      asignacion: a,
      proyecto,
      bp,
      sueldoRow,
      rateProyecto,
      rateBP,
      marginPercent,
      monto,
    }
  })
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
  /** Per-month breakdown, indexed 0..11 (mes = i+1). */
  byMonth: ProjectMonthSummary[]
}

export function summarizeProjectsAnnual(
  proyectos: Proyecto[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  brandPartners?: BrandPartner[],
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[]
): ProjectAnnualSummary[] {
  return proyectos.map((p) => {
    const byMonth = MONTHS.map((m) =>
      calculateProjectMargin(
        p,
        asignaciones,
        sueldos,
        m,
        brandPartners,
        honorariosMensuales
      )
    )
    const revenue = byMonth.reduce((s, x) => s + x.revenue, 0)
    const cost = byMonth.reduce((s, x) => s + x.cost, 0)
    const totalHoras = byMonth.reduce((s, x) => s + x.totalHoras, 0)
    const months = byMonth.filter((m) => m.bps > 0)
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

/** Top-level annual KPIs for the Proyectos dashboard. */
export interface ProyectosAnnualKpis {
  revenue: number
  costs: number
  marginPercent: number
  idleHours: number
  activeProjects: number
}

export function calculateProyectosAnnualKpis(
  proyectos: Proyecto[],
  brandPartners: BrandPartner[],
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  honorariosMensuales?: { proyecto_id: Id; mes: number; honorarios: number }[]
): ProyectosAnnualKpis {
  const revenue = MONTHS.reduce(
    (s, m) =>
      s + calculateMonthlyRevenue(proyectos, asignaciones, m, honorariosMensuales),
    0
  )
  const costs = MONTHS.reduce(
    (s, m) => s + calculateBPCosts(asignaciones, sueldos, m),
    0
  )
  const idleHours = MONTHS.reduce(
    (s, m) => s + calculateIdleHours(brandPartners, asignaciones, m),
    0
  )
  const activeProjects = new Set(
    asignaciones.map((a) => String(a.proyecto_id))
  ).size
  return {
    revenue,
    costs,
    marginPercent: calculateMargin(revenue, costs),
    idleHours,
    activeProjects,
  }
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
  /** Effective per-hour BP rate, weighted across the months they actually worked. */
  ratePerHourBpAvg: number
  /** Reference value of this BP's hours at the project's contractual rate:
   *  `Σ_mes horas_bp[m] × (honorarios[m] / horas_requeridas_mensual)`.
   *  Not a real income figure — compared to `costosAnuales` it answers
   *  "is the project profitable on this BP at the contracted rate?". */
  ingresosAnuales: number
  /** Yearly cost the BP represents on the project: Σ horas[mes] × sueldo[mes]/160. */
  costosAnuales: number
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
  honorariosMensuales: { mes: number; honorarios: number }[] = []
): ProjectBPBreakdown[] {
  const own = asignaciones.filter((a) => same(a.proyecto_id, proyecto.id))
  const totalProject = own.reduce((s, a) => s + num(a.horas), 0)
  const bpMap = new Map(brandPartners.map((b) => [String(b.id), b]))

  // Project's contractual rate per month: honorarios[m] / horas_requeridas.
  const horasRequeridas =
    proyecto.horas_requeridas_mensual != null &&
    num(proyecto.horas_requeridas_mensual) > 0
      ? num(proyecto.horas_requeridas_mensual)
      : HOURS_PER_MONTH
  const honorariosPorMes = new Array(12).fill(0) as number[]
  for (const h of honorariosMensuales) {
    const idx = h.mes - 1
    if (idx >= 0 && idx < 12) honorariosPorMes[idx] = num(h.honorarios)
  }
  const ratePerHourProyectoPorMes = honorariosPorMes.map((hon) =>
    hon > 0 ? hon / horasRequeridas : 0
  )
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

    // Cost = Σ horas[mes] × (sueldo[mes] / 160). Sueldo varies per month.
    const sueldoByMes = new Map<number, number>()
    let totalSueldo = 0
    for (const s of sueldos) {
      if (String(s.bp_id) !== bpId) continue
      sueldoByMes.set(s.mes, num(s.sueldo))
      totalSueldo += num(s.sueldo)
    }
    let costosAnuales = 0
    for (let i = 0; i < 12; i++) {
      const horas = horasPorMes[i]
      const sueldo = sueldoByMes.get(i + 1) ?? 0
      costosAnuales += horas * (sueldo / HOURS_PER_MONTH)
    }
    // Ingreso de referencia: BP's hours × project's contractual rate for
    // each month. Tells you what the BP's hours are worth at project rate.
    let ingresosAnuales = 0
    for (let i = 0; i < 12; i++) {
      ingresosAnuales += horasPorMes[i] * ratePerHourProyectoPorMes[i]
    }
    const marginPercent =
      ingresosAnuales > 0
        ? ((ingresosAnuales - costosAnuales) / ingresosAnuales) * 100
        : 0
    const estado: BPProjectEstado =
      marginPercent > 20 ? 'rentable' : marginPercent > 0 ? 'neutral' : 'perdida'
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
      ratePerHourBpAvg,
      ingresosAnuales,
      costosAnuales,
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
  _año?: number
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

  const sueldoByMes = new Map<number, number>()
  for (const s of sueldos) {
    if (same(s.bp_id, bp.id)) sueldoByMes.set(s.mes, num(s.sueldo))
  }
  let costosAnuales = 0
  for (let i = 0; i < 12; i++) {
    const horas = horasPorMes[i]
    const sueldo = sueldoByMes.get(i + 1) ?? 0
    costosAnuales += horas * (sueldo / HOURS_PER_MONTH)
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
  mes: number
): number {
  const sueldo = pickSueldoMensual(bp, sueldos, mes)
  const cap =
    bp.capacidad_horas_mensual != null
      ? num(bp.capacidad_horas_mensual)
      : HOURS_PER_MONTH
  if (cap <= 0 || sueldo <= 0) return 0
  return sueldo / cap
}

/** Per-month project hourly value with fallback. */
function valorHoraProyectoForMonth(
  proyecto: Proyecto,
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[],
  mes: number
): number {
  const hRow = honorariosMensuales.find(
    (h) => h.mes === mes && same(h.proyecto_id, proyecto.id)
  )
  const precio = hRow ? num(hRow.honorarios) : num(proyecto.precio_mensual)
  const horas =
    proyecto.horas_requeridas_mensual != null
      ? num(proyecto.horas_requeridas_mensual)
      : HOURS_PER_MONTH
  if (precio <= 0 || horas <= 0) return 0
  return precio / horas
}

export interface BPProjectHorasRow {
  proyecto_id: Id
  proyecto_name: string
  horas: number
}

export interface BPHorasMonthRow {
  bp: BrandPartner
  /** capacidad_horas_mensual (or 160 default). */
  horasContratadas: number
  /** Σ horas asignadas in `mes`. */
  horasAsignadas: number
  /** contratadas - asignadas (>=0; negative becomes 0 because over means we're "over" not "free"). */
  horasLibres: number
  /** asignadas / contratadas × 100 (0 if no capacity). */
  ocupacion: number
  /** Per-project breakdown. */
  byProject: BPProjectHorasRow[]
}

export function bpHorasMonthRow(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  proyectos: Proyecto[],
  mes: number
): BPHorasMonthRow {
  const horasContratadas =
    bp.capacidad_horas_mensual != null
      ? num(bp.capacidad_horas_mensual)
      : HOURS_PER_MONTH

  const own = asignaciones.filter(
    (a) => a.mes === mes && same(a.bp_id, bp.id)
  )
  const horasAsignadas = own.reduce((s, a) => s + num(a.horas), 0)
  const horasLibres = Math.max(0, horasContratadas - horasAsignadas)
  const ocupacion =
    horasContratadas > 0 ? (horasAsignadas / horasContratadas) * 100 : 0

  // Group asignaciones by project (a BP could have multiple rows per project,
  // though in practice not; we sum just in case).
  const byProjMap = new Map<string, number>()
  for (const a of own) {
    const key = String(a.proyecto_id)
    byProjMap.set(key, (byProjMap.get(key) ?? 0) + num(a.horas))
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
  proyectos: Proyecto[]
): BPHorasYearRow {
  return {
    bp,
    byMonth: MONTHS_ALL.map((m) =>
      bpHorasMonthRow(bp, asignaciones, proyectos, m)
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
  /** Σ costo (valor/h BP × horas) across projects in `mes`. */
  costo: number
  /** ingreso - costo. */
  margen: number
  /** margen / ingreso × 100 (0 if no ingreso). */
  margenPercent: number
  /** Per-project breakdown. */
  byProject: BPProjectRentabilidadRow[]
}

export function bpRentabilidadMonthRow(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  proyectos: Proyecto[],
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[],
  mes: number
): BPRentabilidadMonthRow {
  const sueldoMensual = pickSueldoMensual(bp, sueldos, mes)
  const valorHoraBP = valorHoraBPForMonth(bp, sueldos, mes)

  const own = asignaciones.filter(
    (a) => a.mes === mes && same(a.bp_id, bp.id)
  )

  const projById = new Map(proyectos.map((p) => [String(p.id), p]))
  const byProjMap = new Map<string, { proyecto: Proyecto; horas: number }>()
  for (const a of own) {
    const proyecto = projById.get(String(a.proyecto_id))
    if (!proyecto) continue
    const key = String(a.proyecto_id)
    const prev = byProjMap.get(key)
    byProjMap.set(key, {
      proyecto,
      horas: (prev?.horas ?? 0) + num(a.horas),
    })
  }

  const byProject: BPProjectRentabilidadRow[] = Array.from(byProjMap.values())
    .map(({ proyecto, horas }) => {
      const vhp = valorHoraProyectoForMonth(proyecto, honorariosMensuales, mes)
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

  const ingresoCotizado = byProject.reduce((s, x) => s + x.ingreso, 0)
  const costo = byProject.reduce((s, x) => s + x.costo, 0)
  const margen = ingresoCotizado - costo
  const margenPercent =
    ingresoCotizado > 0 ? (margen / ingresoCotizado) * 100 : 0

  return {
    bp,
    sueldoMensual,
    ingresoCotizado,
    costo,
    margen,
    margenPercent,
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
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[]
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
        m
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
  /** weighted: totalAsignadas / totalContratadas × 100. */
  ocupacionPromedio: number
  /** Per-month horas asignadas, indexed 0..11. */
  byMonth: number[]
}

export function bpHorasAnnualAggregate(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  proyectos: Proyecto[]
): BPHorasAnnualAggregate {
  const year = bpHorasYear(bp, asignaciones, proyectos)
  const totalContratadas = year.byMonth.reduce(
    (s, m) => s + m.horasContratadas,
    0
  )
  const totalAsignadas = year.byMonth.reduce(
    (s, m) => s + m.horasAsignadas,
    0
  )
  const totalLibres = Math.max(0, totalContratadas - totalAsignadas)
  const ocupacionPromedio =
    totalContratadas > 0 ? (totalAsignadas / totalContratadas) * 100 : 0
  return {
    bp,
    totalContratadas,
    totalAsignadas,
    totalLibres,
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
  /** Mean monthly sueldo across months with sueldo > 0. */
  sueldoPromedio: number
  /** Per-month margen, indexed 0..11. */
  byMonth: number[]
}

export function bpRentabilidadAnnualAggregate(
  bp: BrandPartner,
  asignaciones: Asignacion[],
  sueldos: Sueldo[],
  proyectos: Proyecto[],
  honorariosMensuales: { proyecto_id: Id; mes: number; honorarios: number }[]
): BPRentabilidadAnnualAggregate {
  const year = bpRentabilidadYear(
    bp,
    asignaciones,
    sueldos,
    proyectos,
    honorariosMensuales
  )
  const totalIngreso = year.byMonth.reduce((s, m) => s + m.ingresoCotizado, 0)
  const totalCosto = year.byMonth.reduce((s, m) => s + m.costo, 0)
  const totalMargen = totalIngreso - totalCosto
  const margenPercent = totalIngreso > 0 ? (totalMargen / totalIngreso) * 100 : 0
  const sueldosNonZero = year.byMonth
    .map((m) => m.sueldoMensual)
    .filter((v) => v > 0)
  const sueldoPromedio =
    sueldosNonZero.length === 0
      ? 0
      : sueldosNonZero.reduce((s, x) => s + x, 0) / sueldosNonZero.length
  return {
    bp,
    totalIngreso,
    totalCosto,
    totalMargen,
    margenPercent,
    sueldoPromedio,
    byMonth: year.byMonth.map((m) => m.margen),
  }
}
