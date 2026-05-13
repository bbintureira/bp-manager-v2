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
  /** Length 12, index i = mes i+1. Pad with zeros if the project has no
   *  rows for some months. */
  honorariosPorMes: number[]
  /** Length 12. If the per-month grid is empty (no rows in
   *  `horas_proyecto` yet), callers should pre-fill from
   *  `proyecto.horas_requeridas_mensual` so the export carries the
   *  scalar fallback through every month. */
  horasPorMes: number[]
}

export function exportProyectos(rows: ProyectoExportRow[]): void {
  const aoa: (string | number)[][] = []
  // Header: both groups always written so the file shape is stable even
  // when some projects have no horas / honorarios loaded yet.
  aoa.push([
    'Nombre',
    'Tipo',
    'Estado',
    'Fecha inicio',
    ...MONTH_LABELS.map((m) => `Honorario ${m}`),
    ...MONTH_LABELS.map((m) => `Horas ${m}`),
  ])
  for (const row of rows) {
    const p = row.proyecto
    const hon = row.honorariosPorMes ?? []
    const hor = row.horasPorMes ?? []
    aoa.push([
      p.nombre,
      p.tipo ?? '',
      p.status ?? '',
      formatDate(p.fecha_inicio),
      ...Array.from({ length: 12 }, (_, i) => Number(hon[i]) || 0),
      ...Array.from({ length: 12 }, (_, i) => Number(hor[i]) || 0),
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
}

/**
 * Per the latest spec, the asignaciones export carries assignment-only
 * data — no rates, no margenes, no monetary columns. If you need the
 * rentabilidad numbers, use the BPs / Proyectos exports instead.
 */
export function exportAsignaciones(
  asignaciones: Asignacion[],
  ctx: AsignacionExportContext
): void {
  const projById = new Map(ctx.proyectos.map((p) => [String(p.id), p]))
  const bpById = new Map(ctx.brandPartners.map((b) => [String(b.id), b]))

  const aoa: (string | number)[][] = []
  aoa.push(['Proyecto', 'BP', 'Célula', 'Mes', 'Horas asignadas'])
  for (const a of asignaciones) {
    const horas = Number(a.horas) || 0
    if (horas <= 0) continue
    const mes = Number(a.mes)
    const proyecto = projById.get(String(a.proyecto_id)) ?? null
    const bp = bpById.get(String(a.bp_id)) ?? null
    aoa.push([
      proyecto?.nombre ?? '—',
      bp?.nombre ?? '—',
      bp?.grouper ?? '',
      MONTH_LABELS[mes - 1] ?? String(mes),
      Math.round(horas * 100) / 100,
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Asignaciones')
  downloadWorkbook(wb, `asignaciones_${todayStamp()}.xlsx`)
}
