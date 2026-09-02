import * as XLSX from 'xlsx'
import type { Asignacion, BrandPartner, Id, Proyecto, Sueldo } from '@/lib/queries'

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
  aoa.push(['Nombre', ...monthCols])
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
    aoa.push([bp.nombre, ...triplets])
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
  aoa.push(['Nombre', ...MONTH_LABELS.map((m) => `Horas ${m}`)])
  for (const bp of bps) {
    const months: number[] = []
    for (let m = 1; m <= 12; m++) {
      months.push(byBpMes.get(`${String(bp.id)}::${m}`) ?? 0)
    }
    aoa.push([bp.nombre, ...months])
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
  aoa.push(['Proyecto', 'BP', 'Mes', 'Horas asignadas'])
  for (const a of asignaciones) {
    const horas = Number(a.horas) || 0
    if (horas <= 0) continue
    const mes = Number(a.mes)
    const proyecto = projById.get(String(a.proyecto_id)) ?? null
    const bp = bpById.get(String(a.bp_id)) ?? null
    aoa.push([
      proyecto?.nombre ?? '—',
      bp?.nombre ?? '—',
      MONTH_LABELS[mes - 1] ?? String(mes),
      Math.round(horas * 100) / 100,
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Asignaciones')
  downloadWorkbook(wb, `asignaciones_${todayStamp()}.xlsx`)
}

// --------------------------------------------------------------------------
// 5. Sueldos y horas contratadas — round-trippable per-BP grid
// --------------------------------------------------------------------------

/**
 * Blank vs zero is load-bearing in this workbook, so both exporter and
 * importer treat them as different values:
 *
 *   - `''` (blank)  = there is no row in the table for that month. The BP
 *                     falls back to the scalar (`capacidad_horas_mensual`,
 *                     then 160) and, for sueldos, simply has nothing loaded.
 *   - `0`           = there IS a row, holding zero. For capacidad that is a
 *                     deliberate "no dedication this month" (see
 *                     `capacidadBPForMonth`); for sueldos it is a real
 *                     zero-cost month.
 *
 * Writing blanks as zeros would materialize 12 sueldo rows per BP on the
 * first round-trip, which in turn would pull every BP into every month of
 * `/api/export` (a BP counts as present in a month when it has a sueldo
 * row). Hence the empty strings.
 */
export interface SueldosHorasExportInput {
  brandPartners: BrandPartner[]
  sueldos: Sueldo[]
  /** `horas_contratadas` rows — presence of a row is the signal, so this
   *  must be the raw table, not a fallback-filled grid. */
  capacidades: { bp_id: Id; mes: number; horas: number }[]
  /** Only used for the read-only reference sheet. */
  asignaciones: Asignacion[]
}

/** `Map<'bpId::mes', number>` from any per-BP per-month row set. */
function indexByBpMes<T extends { bp_id: Id; mes: number }>(
  rows: T[],
  value: (row: T) => number
): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const m = Number(r.mes)
    if (!Number.isFinite(m) || m < 1 || m > 12) continue
    out.set(`${String(r.bp_id)}::${m}`, value(r))
  }
  return out
}

/**
 * One workbook with the two per-BP grids that can be edited in bulk and
 * uploaded back: sueldos and horas contratadas (the BP's monthly
 * capacity). Assigned hours are per-project, so they can't be split back
 * out of a per-BP total — they ride along as a read-only reference sheet
 * and are edited through the Asignaciones export/import instead.
 */
export function exportSueldosYHoras(input: SueldosHorasExportInput): void {
  const { brandPartners, sueldos, capacidades, asignaciones } = input

  const sueldoByBpMes = indexByBpMes(sueldos, (s) => Number(s.sueldo) || 0)
  const capacidadByBpMes = indexByBpMes(capacidades, (c) => Number(c.horas) || 0)

  // Assigned hours are summed across projects for the reference sheet.
  const asignadasByBpMes = new Map<string, number>()
  for (const a of asignaciones) {
    const m = Number(a.mes)
    if (!Number.isFinite(m) || m < 1 || m > 12) continue
    const key = `${String(a.bp_id)}::${m}`
    asignadasByBpMes.set(key, (asignadasByBpMes.get(key) ?? 0) + (Number(a.horas) || 0))
  }

  /** Row builder shared by the two editable sheets. */
  function grid(
    prefix: string,
    lookup: Map<string, number>,
    /** When false, absent months are written as blank instead of 0. */
    fillAbsentWithZero: boolean
  ): (string | number)[][] {
    const aoa: (string | number)[][] = [
      ['Nombre', ...MONTH_LABELS.map((m) => `${prefix} ${m}`)],
    ]
    for (const bp of brandPartners) {
      const cells: (string | number)[] = []
      for (let m = 1; m <= 12; m++) {
        const hit = lookup.get(`${String(bp.id)}::${m}`)
        cells.push(hit == null ? (fillAbsentWithZero ? 0 : '') : hit)
      }
      aoa.push([bp.nombre, ...cells])
    }
    return aoa
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(grid('Sueldo', sueldoByBpMes, false)),
    'Sueldos'
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(grid('Horas', capacidadByBpMes, false)),
    'Horas contratadas'
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(grid('Horas', asignadasByBpMes, true)),
    'Horas asignadas (ref)'
  )

  const instrucciones: string[][] = [
    ['Cómo usar esta planilla'],
    [''],
    ['1. Editá los números en las hojas "Sueldos" y "Horas contratadas".'],
    ['2. No cambies los nombres de las hojas ni la fila de encabezados.'],
    ['3. Subila con el botón "Subir sueldos y horas" en la pestaña Brand Partners.'],
    [''],
    ['Celda vacía = no hay dato cargado para ese mes (se ignora al subir).'],
    ['Celda en 0 = dato cargado en cero (se guarda como cero).'],
    ['Vaciar una celda NO borra el dato ya cargado: para ponerlo en cero, escribí 0.'],
    [''],
    ['"Horas contratadas" es la capacidad mensual del BP, no las horas asignadas.'],
    ['La hoja "Horas asignadas (ref)" es solo de consulta: no se importa.'],
    ['Las horas por proyecto se editan desde Asignaciones (Descargar / Subir Excel).'],
    [''],
    ['Los BPs se identifican por nombre. Si un nombre no existe en la app,'],
    ['esa fila se omite y el aviso final te dice cuáles fueron.'],
  ]
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(instrucciones),
    'Instrucciones'
  )

  downloadWorkbook(wb, `sueldos_y_horas_${todayStamp()}.xlsx`)
}
