import * as XLSX from 'xlsx'
import type { Asignacion, BrandPartner, Proyecto } from '@/lib/queries'

/**
 * Excel exporters for the dashboard sections. Each function builds an
 * .xlsx in-memory and triggers a browser download — no backend, no
 * extra fetches. Callers pass the in-memory state they already have.
 */

const MONTH_LABELS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

/** `YYYY-MM-DD` of today — used in filenames so they sort chronologically. */
function todayStamp(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** `dd/mm/yyyy` of a Postgres DATE (`YYYY-MM-DD`) or empty for null. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d.slice(0, 2)}/${m}/${y}`
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, filename)
}

// --------------------------------------------------------------------------
// 1. Proyectos
// --------------------------------------------------------------------------

export interface ProyectoExportRow {
  proyecto: Proyecto
  /** Length 12, index i = mes i+1. */
  honorariosPorMes: number[]
  horasPorMes: number[]
}

export function exportProyectos(rows: ProyectoExportRow[]): void {
  const aoa: (string | number)[][] = []
  // Header
  aoa.push([
    'Nombre',
    'Tipo',
    'Estado',
    'Fecha inicio',
    ...MONTH_LABELS.map((m) => `Honorario ${m}`),
    ...MONTH_LABELS.map((m) => `Horas ${m}`),
  ])
  // Rows
  for (const row of rows) {
    const p = row.proyecto
    aoa.push([
      p.nombre,
      p.tipo ?? '',
      p.status ?? '',
      formatDate(p.fecha_inicio),
      ...row.honorariosPorMes.map((v) => Number(v) || 0),
      ...row.horasPorMes.map((v) => Number(v) || 0),
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Proyectos')
  downloadWorkbook(wb, `proyectos_${todayStamp()}.xlsx`)
}

// --------------------------------------------------------------------------
// 2. Brand Partners — rentabilidad (ingreso/costo/margen × 12 meses)
// --------------------------------------------------------------------------

export interface BPRentabilidadExportRow {
  bp: BrandPartner
  /** Per-month figures, length 12 each. */
  ingresosPorMes: number[]
  costosPorMes: number[]
  margenesPorMes: number[]
}

export function exportBrandPartners(rows: BPRentabilidadExportRow[]): void {
  const aoa: (string | number)[][] = []
  const monthCols: string[] = []
  for (const m of MONTH_LABELS) {
    monthCols.push(`Ingresos ${m}`, `Costo ${m}`, `Margen ${m}`)
  }
  aoa.push(['Nombre', 'Seniority', 'Célula', ...monthCols])
  for (const row of rows) {
    const bp = row.bp
    const triplets: number[] = []
    for (let i = 0; i < 12; i++) {
      triplets.push(
        Number(row.ingresosPorMes[i]) || 0,
        Number(row.costosPorMes[i]) || 0,
        Number(row.margenesPorMes[i]) || 0
      )
    }
    aoa.push([
      bp.nombre,
      bp.seniority ?? '',
      bp.grouper ?? '',
      ...triplets,
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rentabilidad')
  downloadWorkbook(wb, `brand_partners_rentabilidad_${todayStamp()}.xlsx`)
}

// --------------------------------------------------------------------------
// 3. Brand Partners — horas asignadas por mes
// --------------------------------------------------------------------------

export function exportBrandPartnersHoras(
  bps: BrandPartner[],
  asignaciones: Asignacion[]
): void {
  // Pre-aggregate per (bp_id, mes).
  const byBpMes = new Map<string, number>()
  for (const a of asignaciones) {
    const m = Number(a.mes)
    if (!Number.isFinite(m) || m < 1 || m > 12) continue
    const key = `${String(a.bp_id)}::${m}`
    byBpMes.set(key, (byBpMes.get(key) ?? 0) + (Number(a.horas) || 0))
  }
  const aoa: (string | number)[][] = []
  aoa.push([
    'Nombre',
    'Seniority',
    'Célula',
    ...MONTH_LABELS.map((m) => `Horas ${m}`),
  ])
  for (const bp of bps) {
    const months: number[] = []
    for (let m = 1; m <= 12; m++) {
      months.push(byBpMes.get(`${String(bp.id)}::${m}`) ?? 0)
    }
    aoa.push([
      bp.nombre,
      bp.seniority ?? '',
      bp.grouper ?? '',
      ...months,
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Horas')
  downloadWorkbook(wb, `brand_partners_horas_${todayStamp()}.xlsx`)
}

// --------------------------------------------------------------------------
// 4. Asignaciones
// --------------------------------------------------------------------------

export interface AsignacionExportContext {
  proyectos: Proyecto[]
  brandPartners: BrandPartner[]
  sueldos: { bp_id: string | number; mes: number; sueldo: number }[]
  honorariosMensuales: {
    proyecto_id: string | number
    mes: number
    honorarios: number
  }[]
  horasMensuales: {
    proyecto_id: string | number
    mes: number
    horas: number
  }[]
}

/** 160h is the conventional capacity; mirrors HOURS_PER_MONTH. */
const HOURS_PER_MONTH = 160

export function exportAsignaciones(
  asignaciones: Asignacion[],
  ctx: AsignacionExportContext
): void {
  const projById = new Map(
    ctx.proyectos.map((p) => [String(p.id), p])
  )
  const bpById = new Map(
    ctx.brandPartners.map((b) => [String(b.id), b])
  )
  const sueldoByKey = new Map<string, number>()
  for (const s of ctx.sueldos) {
    sueldoByKey.set(`${String(s.bp_id)}::${Number(s.mes)}`, Number(s.sueldo) || 0)
  }
  const horasReqByKey = new Map<string, number>()
  for (const h of ctx.horasMensuales) {
    horasReqByKey.set(
      `${String(h.proyecto_id)}::${Number(h.mes)}`,
      Number(h.horas) || 0
    )
  }
  const honorariosByKey = new Map<string, number>()
  for (const h of ctx.honorariosMensuales) {
    honorariosByKey.set(
      `${String(h.proyecto_id)}::${Number(h.mes)}`,
      Number(h.honorarios) || 0
    )
  }

  const aoa: (string | number)[][] = []
  aoa.push([
    'Proyecto',
    'BP',
    'Célula',
    'Mes',
    'Horas asignadas',
    '$/h proyecto',
    '$/h BP',
    'Margen ($)',
    'Margen (%)',
  ])
  for (const a of asignaciones) {
    const horas = Number(a.horas) || 0
    if (horas <= 0) continue
    const mes = Number(a.mes)
    const proyecto = projById.get(String(a.proyecto_id)) ?? null
    const bp = bpById.get(String(a.bp_id)) ?? null

    const honorarios =
      honorariosByKey.get(`${String(a.proyecto_id)}::${mes}`) ??
      Number(proyecto?.precio_mensual ?? proyecto?.honorarios_cotizador ?? 0)
    const horasReq =
      horasReqByKey.get(`${String(a.proyecto_id)}::${mes}`) ||
      Number(proyecto?.horas_requeridas_mensual ?? HOURS_PER_MONTH)
    const ratePerHourProy = horasReq > 0 ? honorarios / horasReq : 0

    const sueldoMes =
      sueldoByKey.get(`${String(a.bp_id)}::${mes}`) ??
      Number(bp?.sueldo_mensual ?? 0)
    const capacidad =
      bp?.capacidad_horas_mensual != null && Number(bp.capacidad_horas_mensual) > 0
        ? Number(bp.capacidad_horas_mensual)
        : HOURS_PER_MONTH
    const ratePerHourBp = capacidad > 0 ? sueldoMes / capacidad : 0

    const ingreso = ratePerHourProy * horas
    const costo = ratePerHourBp * horas
    const margen = ingreso - costo
    const margenPct = ingreso > 0 ? (margen / ingreso) * 100 : 0

    aoa.push([
      proyecto?.nombre ?? '—',
      bp?.nombre ?? '—',
      bp?.grouper ?? '',
      MONTH_LABELS[mes - 1] ?? String(mes),
      Math.round(horas * 100) / 100,
      Math.round(ratePerHourProy * 100) / 100,
      Math.round(ratePerHourBp * 100) / 100,
      Math.round(margen * 100) / 100,
      Math.round(margenPct * 10) / 10,
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Asignaciones')
  downloadWorkbook(wb, `asignaciones_${todayStamp()}.xlsx`)
}
