import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

/**
 * Excel importers — one per dashboard section. Each parses the first
 * worksheet of the uploaded file using the column headers that the
 * matching exporter writes, then upserts into Supabase. Rows whose
 * referenced entity (project / BP) can't be resolved by
 * name are skipped and counted; the rest commit.
 */

export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  message: string
}

const MONTH_LABELS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]
const MONTH_LOOKUP: Record<string, number> = (() => {
  const out: Record<string, number> = {}
  MONTH_LABELS.forEach((m, i) => {
    out[m.toLowerCase()] = i + 1
  })
  // Friendly aliases — full names with and without diacritics.
  const aliases: [string, number][] = [
    ['enero', 1], ['febrero', 2], ['marzo', 3], ['abril', 4],
    ['mayo', 5], ['junio', 6], ['julio', 7], ['agosto', 8],
    ['septiembre', 9], ['setiembre', 9], ['octubre', 10],
    ['noviembre', 11], ['diciembre', 12],
  ]
  for (const [k, v] of aliases) out[k] = v
  return out
})()

/** Long-form month names, accepted as column headers alongside the
 *  abbreviations the exporter writes — hand-made sheets tend to spell
 *  them out. */
const MONTH_LABELS_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function mesFromLabel(raw: unknown): number {
  if (typeof raw === 'number' && raw >= 1 && raw <= 12) return raw
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 0
  return MONTH_LOOKUP[s] ?? 0
}

/** Parse 'dd/mm/yyyy' or 'YYYY-MM-DD' to ISO. Returns null otherwise. */
function parseDateLoose(raw: unknown): string | null {
  if (!raw) return null
  if (raw instanceof Date) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, '0')
    const d = String(raw.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(raw).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

function toNum(raw: unknown): number {
  if (raw == null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}

function trimStr(raw: unknown): string {
  return raw == null ? '' : String(raw).trim()
}

async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer()
  // `cellDates: true` returns JS Date objects for date cells so we don't
  // have to parse Excel's serial-number format. `raw: true` on
  // sheet_to_json keeps numbers as numbers (rather than the locale-
  // formatted strings `raw: false` produces — those break `Number(...)`
  // whenever the user has cells formatted with thousand separators or
  // currency, which is the failure mode the upload was hitting).
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const name = wb.SheetNames[0]
  if (!name) return []
  const ws = wb.Sheets[name]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  })
}

/** Fuzzy column reader — looks up a header by exact match, then by
 *  case-insensitive trimmed match. Lets us tolerate headers like
 *  'Nombre ' / 'NOMBRE' / 'nombre' that Excel or copy-paste might
 *  produce, instead of silently dropping every row. */
function getCol(row: Record<string, unknown>, name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name]
  const target = name.toLowerCase().trim()
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().trim() === target) return row[k]
  }
  return undefined
}

/** Lowercase + trim case-insensitive lookup map. */
function indexByName<T extends { nombre: string; id: unknown }>(
  rows: T[]
): Map<string, T> {
  const m = new Map<string, T>()
  for (const r of rows) m.set(r.nombre.trim().toLowerCase(), r)
  return m
}

// --------------------------------------------------------------------------
// 1. Proyectos
// --------------------------------------------------------------------------

interface ProyectoRow {
  id: string
  nombre: string
  tipo: string | null
  status: string | null
  fecha_inicio: string | null
}

export async function importProyectos(file: File): Promise<ImportResult> {
  const rows = await readSheet(file)
  if (rows.length === 0) {
    return { success: false, imported: 0, skipped: 0, message: 'El archivo está vacío.' }
  }

  // Quick sanity check on the column layout — if no row carries a
  // 'Nombre' cell at all, every iteration would silently skip and the
  // user would see an unhelpful 'Sin proyectos importados.' toast.
  const firstRow = rows[0] as Record<string, unknown>
  const hasNombreCol =
    rows.some((r) => getCol(r as Record<string, unknown>, 'Nombre') != null) ||
    Object.keys(firstRow).some((k) => k.toLowerCase().trim() === 'nombre')
  if (!hasNombreCol) {
    const found = Object.keys(firstRow).slice(0, 8).join(', ')
    return {
      success: false,
      imported: 0,
      skipped: rows.length,
      message: `Falta la columna "Nombre" en el Excel. Columnas detectadas: ${found || '(ninguna)'}`,
    }
  }

  // Snapshot of existing projects (by name) so we can decide update-vs-insert.
  const { data: existing, error: fetchErr } = await supabase
    .from('proyectos')
    .select('id, nombre, tipo, status, fecha_inicio')
  if (fetchErr) {
    return {
      success: false,
      imported: 0,
      skipped: rows.length,
      message: `No se pudo leer proyectos: ${fetchErr.message}`,
    }
  }
  const byName = indexByName(((existing ?? []) as ProyectoRow[]))

  let imported = 0
  let updated = 0
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const nombre = trimStr(getCol(row, 'Nombre'))
    if (!nombre) {
      skipped++
      continue
    }
    const tipo = trimStr(getCol(row, 'Tipo')) || null
    const status = trimStr(getCol(row, 'Estado')) || 'activo'
    const fecha_inicio = parseDateLoose(getCol(row, 'Fecha inicio'))

    // Pre-compute the per-month grids and scalar averages.
    const honMonths: number[] = []
    const horasMonths: number[] = []
    let honSum = 0
    let honCount = 0
    let horasSum = 0
    let horasCount = 0
    for (let i = 0; i < 12; i++) {
      const h = toNum(getCol(row, `Honorario ${MONTH_LABELS[i]}`))
      const hr = toNum(getCol(row, `Horas ${MONTH_LABELS[i]}`))
      honMonths.push(h)
      horasMonths.push(hr)
      if (h > 0) {
        honSum += h
        honCount++
      }
      if (hr > 0) {
        horasSum += hr
        horasCount++
      }
    }
    const honPromedio = honCount > 0 ? honSum / honCount : 0
    const horasPromedio = horasCount > 0 ? horasSum / horasCount : 0

    // Match by name (case-insensitive).
    const found = byName.get(nombre.trim().toLowerCase())
    let proyecto_id: string

    const baseFields = {
      nombre,
      tipo,
      status,
      fecha_inicio,
      // Mirror per-month averages into the legacy scalars to keep
      // anywhere-that-still-reads-them in sync.
      ...(honPromedio > 0
        ? { precio_mensual: honPromedio, honorarios_cotizador: honPromedio }
        : { honorarios_cotizador: 0, precio_mensual: null }),
      ...(horasPromedio > 0
        ? { horas_requeridas_mensual: horasPromedio }
        : {}),
    }

    if (found) {
      proyecto_id = String(found.id)
      // `.select('id')` forces Supabase to return the row it touched,
      // so we can confirm the UPDATE actually hit something (RLS,
      // mismatched id, etc.). Without this the call resolves with
      // {error: null, data: null} either way.
      const { data, error } = await supabase
        .from('proyectos')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(baseFields as any)
        .eq('id', proyecto_id)
        .select('id')
      if (error) {
        skipped++
        errors.push(`${nombre}: ${error.message}`)
        continue
      }
      if (!data || data.length === 0) {
        skipped++
        errors.push(`${nombre}: update no afectó filas (id ${proyecto_id})`)
        continue
      }
      updated++
    } else {
      const { data, error } = await supabase
        .from('proyectos')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(baseFields as any)
        .select('id')
        .single()
      if (error || !data) {
        skipped++
        errors.push(`${nombre}: ${error?.message ?? 'insert failed'}`)
        continue
      }
      proyecto_id = String(data.id)
      inserted++
    }

    // Per-month honorarios + horas. We replace the project's monthly
    // state atomically — delete-then-insert — instead of upserting on
    // (proyecto_id, mes). Reason: \`upsert\` with \`onConflict\` relies on
    // the UNIQUE constraint being present AND on PostgREST translating
    // the conflict resolution correctly. We were seeing the call
    // resolve as 'success' without any new value landing (likely the
    // constraint accepted the row as a duplicate-no-op). Delete-then-
    // insert removes that dependency entirely.
    const honRows = honMonths.map((honorarios, i) => ({
      proyecto_id,
      mes: i + 1,
      honorarios: Math.max(0, honorarios),
    }))
    const horasRows = horasMonths.map((horas, i) => ({
      proyecto_id,
      mes: i + 1,
      horas: Math.max(0, horas),
    }))
    const [delHonRes, delHorasRes] = await Promise.all([
      supabase
        .from('proyecto_honorarios_mensuales')
        .delete()
        .eq('proyecto_id', proyecto_id),
      supabase
        .from('horas_proyecto')
        .delete()
        .eq('proyecto_id', proyecto_id),
    ])
    if (delHonRes.error || delHorasRes.error) {
      skipped++
      errors.push(
        `${nombre}: borrado mensual falló: ${(delHonRes.error ?? delHorasRes.error)?.message ?? '?'}`
      )
      continue
    }
    const [honRes, horasRes] = await Promise.all([
      supabase
        .from('proyecto_honorarios_mensuales')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(honRows as any)
        .select('id'),
      supabase
        .from('horas_proyecto')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(horasRows as any)
        .select('id'),
    ])
    if (honRes.error || horasRes.error) {
      skipped++
      errors.push(
        `${nombre}: insert mensual falló: ${(honRes.error ?? horasRes.error)?.message ?? '?'}`
      )
      continue
    }
    const honWritten = honRes.data?.length ?? 0
    const horasWritten = horasRes.data?.length ?? 0
    if (honWritten === 0 && horasWritten === 0) {
      skipped++
      errors.push(
        `${nombre}: la inserción mensual no escribió ninguna fila`
      )
      continue
    }
    console.log('[import proyectos]', nombre, {
      proyecto_id,
      sent_honorarios: honMonths,
      sent_horas: horasMonths,
      honorarios_rows_written: honWritten,
      horas_rows_written: horasWritten,
    })
    imported++
  }

  const parts: string[] = []
  if (updated > 0) parts.push(`${updated} actualizados`)
  if (inserted > 0) parts.push(`${inserted} creados`)
  if (skipped > 0) parts.push(`${skipped} con errores`)
  const message =
    imported === 0
      ? `Sin proyectos importados. ${errors[0] ?? ''}`.trim()
      : `Proyectos: ${parts.join(' · ')}.`
  return {
    success: imported > 0,
    imported,
    skipped,
    message,
  }
}

// --------------------------------------------------------------------------
// 2. Brand Partners
// --------------------------------------------------------------------------

interface BPRow {
  id: string
  nombre: string
  activo: boolean | null
}

export async function importBrandPartners(file: File): Promise<ImportResult> {
  const rows = await readSheet(file)
  if (rows.length === 0) {
    return { success: false, imported: 0, skipped: 0, message: 'El archivo está vacío.' }
  }

  const bpRes = await supabase
    .from('brand_partners')
    .select('id, nombre, activo')
  if (bpRes.error) {
    return {
      success: false,
      imported: 0,
      skipped: rows.length,
      message: `No se pudo leer BPs: ${bpRes.error.message ?? ''}`,
    }
  }
  const bpByName = indexByName(((bpRes.data ?? []) as BPRow[]))

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const nombre = trimStr(getCol(row, 'Nombre'))
    if (!nombre) {
      skipped++
      continue
    }

    // We don't import the 'Horas Ene…Dic' columns: they're aggregates
    // across projects, so they can't be deterministically split back
    // into per-project asignaciones. The asignaciones import is the
    // place to load per-project hours.
    const found = bpByName.get(nombre.toLowerCase())
    if (found) {
      const { error } = await supabase
        .from('brand_partners')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ nombre } as any)
        .eq('id', found.id)
      if (error) {
        skipped++
        errors.push(`${nombre}: ${error.message}`)
        continue
      }
    } else {
      const { error } = await supabase
        .from('brand_partners')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ nombre, activo: true } as any)
      if (error) {
        skipped++
        errors.push(`${nombre}: ${error.message}`)
        continue
      }
    }
    imported++
  }

  const noteHoras =
    'Las horas mensuales se importan por la sección Asignaciones (Excel necesita la columna Proyecto).'
  const message =
    imported === 0
      ? `Sin BPs importados. ${errors[0] ?? ''}`.trim()
      : `${imported} BPs importados${skipped > 0 ? ` · ${skipped} con errores` : ''}. ${noteHoras}`
  return { success: imported > 0, imported, skipped, message }
}

// --------------------------------------------------------------------------
// 3. Asignaciones
// --------------------------------------------------------------------------

export async function importAsignaciones(file: File): Promise<ImportResult> {
  const rows = await readSheet(file)
  if (rows.length === 0) {
    return { success: false, imported: 0, skipped: 0, message: 'El archivo está vacío.' }
  }

  const [pRes, bRes] = await Promise.all([
    supabase.from('proyectos').select('id, nombre'),
    supabase.from('brand_partners').select('id, nombre'),
  ])
  if (pRes.error || bRes.error) {
    return {
      success: false,
      imported: 0,
      skipped: rows.length,
      message: `No se pudo leer proyectos / BPs: ${(pRes.error ?? bRes.error)?.message ?? ''}`,
    }
  }
  const projByName = indexByName(
    ((pRes.data ?? []) as { id: string; nombre: string }[])
  )
  const bpByName = indexByName(
    ((bRes.data ?? []) as { id: string; nombre: string }[])
  )

  // Build the full upsert batch in memory, then send it as a single
  // round-trip. Skipped rows are tracked separately.
  const upsertRows: { proyecto_id: string; bp_id: string; mes: number; horas: number }[] = []
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const proyectoName = trimStr(getCol(row, 'Proyecto'))
    const bpName = trimStr(getCol(row, 'BP'))
    const mes = mesFromLabel(getCol(row, 'Mes'))
    const horas = toNum(getCol(row, 'Horas asignadas'))

    if (!proyectoName || !bpName) {
      skipped++
      continue
    }
    if (mes < 1 || mes > 12) {
      skipped++
      errors.push(
        `Mes inválido para ${bpName} / ${proyectoName}: ${String(getCol(row, 'Mes') ?? '')}`
      )
      continue
    }
    const p = projByName.get(proyectoName.toLowerCase())
    const bp = bpByName.get(bpName.toLowerCase())
    if (!p) {
      skipped++
      errors.push(`Proyecto no encontrado: ${proyectoName}`)
      continue
    }
    if (!bp) {
      skipped++
      errors.push(`BP no encontrado: ${bpName}`)
      continue
    }
    upsertRows.push({
      proyecto_id: String(p.id),
      bp_id: String(bp.id),
      mes,
      horas: Math.max(0, horas),
    })
  }

  if (upsertRows.length === 0) {
    return {
      success: false,
      imported: 0,
      skipped,
      message: `Sin asignaciones importadas. ${errors[0] ?? ''}`.trim(),
    }
  }

  const { error } = await supabase
    .from('asignaciones')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(upsertRows as any, { onConflict: 'proyecto_id,bp_id,mes' })
  if (error) {
    return {
      success: false,
      imported: 0,
      skipped: rows.length,
      message: `Upsert falló: ${error.message}`,
    }
  }

  return {
    success: true,
    imported: upsertRows.length,
    skipped,
    message: `${upsertRows.length} asignaciones importadas${
      skipped > 0 ? ` · ${skipped} omitidas` : ''
    }.`,
  }
}

// --------------------------------------------------------------------------
// 4. Sueldos y horas contratadas
// --------------------------------------------------------------------------

/** Reads a workbook and returns a sheet by name, tolerating case and
 *  surrounding whitespace. Returns null when the sheet isn't there. */
function sheetRowsByName(
  wb: XLSX.WorkBook,
  name: string
): Record<string, unknown>[] | null {
  const target = name.toLowerCase().trim()
  const hit = wb.SheetNames.find((n) => n.toLowerCase().trim() === target)
  if (!hit) return null
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[hit], {
    defval: null,
    raw: true,
  })
}

/** True for cells the user left empty. Blank is NOT zero — see the
 *  contract documented on `exportSueldosYHoras`. */
function isBlankCell(raw: unknown): boolean {
  return raw == null || (typeof raw === 'string' && raw.trim() === '')
}

/**
 * Number parser for the sueldos/horas grids. Returns null when the cell
 * has content that isn't a number, so the caller can report it instead
 * of silently dropping the value; blank cells are filtered out before
 * this is called.
 *
 * Tolerates Argentine formatting ('$ 1.616.903,50', '2.005.317') because
 * these grids get pasted into from the P&L, where numbers arrive as
 * formatted text.
 */
function parseNumberLoose(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw ?? '').trim()
  if (!s) return null
  // Strip currency, spaces and non-breaking spaces.
  s = s.replace(/[$\s\u00a0]/g, '')
  if (!s) return null

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // Whichever separator comes last is the decimal one.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Trailing ',dd' is a decimal comma; anything else is a thousands mark.
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (hasDot) {
    // '1.234' / '2.005.317' are thousands groups, not decimals. A single
    // dot followed by other than exactly 3 digits ('7.5') stays decimal.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Reads the 12 month cells of a row, given the header prefix the
 *  exporter writes ('Sueldo' / 'Horas'). Falls back to bare month labels
 *  so a hand-made sheet with 'Ene…Dic' headers still works. */
type Cell =
  /** Empty cell — leave the table untouched for that month. */
  | { kind: 'blank' }
  | { kind: 'value'; value: number }
  /** Non-empty but not a number — reported, never written. */
  | { kind: 'invalid'; raw: string }

function readMonthCells(row: Record<string, unknown>, prefix: string): Cell[] {
  return MONTH_LABELS.map((label, i) => {
    // 'Sueldo Ene' (what the exporter writes) first, then the looser
    // shapes a hand-made sheet is likely to use.
    const candidates = [
      `${prefix} ${label}`,
      label,
      `${prefix} ${MONTH_LABELS_FULL[i]}`,
      MONTH_LABELS_FULL[i],
    ]
    let cell: unknown = undefined
    for (const c of candidates) {
      cell = getCol(row, c)
      if (cell !== undefined) break
    }
    if (isBlankCell(cell)) return { kind: 'blank' }
    const value = parseNumberLoose(cell)
    if (value == null) return { kind: 'invalid', raw: String(cell) }
    return { kind: 'value', value }
  })
}

interface GridUpsert {
  bp_id: string
  mes: number
  value: number
}

/** Shared parse of one editable sheet into (bp, mes, value) triples. */
function parseGridSheet(
  rows: Record<string, unknown>[],
  prefix: string,
  bpByName: Map<string, { id: string; nombre: string }>,
  label: string,
  errors: string[]
): { upserts: GridUpsert[]; skippedRows: number } {
  const upserts: GridUpsert[] = []
  let skippedRows = 0

  for (const row of rows) {
    const nombre = trimStr(getCol(row, 'Nombre'))
    if (!nombre) {
      skippedRows++
      continue
    }
    const bp = bpByName.get(nombre.toLowerCase())
    if (!bp) {
      skippedRows++
      errors.push(`BP no encontrado: ${nombre}`)
      continue
    }
    const cells = readMonthCells(row, prefix)
    cells.forEach((cell, i) => {
      // Blank cell: nothing loaded for that month — leave the table as is.
      if (cell.kind === 'blank') return
      if (cell.kind === 'invalid') {
        errors.push(
          `${label} no numérico para ${nombre} en ${MONTH_LABELS[i]}: "${cell.raw}"`
        )
        return
      }
      // A negative sueldo or capacity is never a real value; it is the
      // signature of a derived report (margen, cobertura, "obsoleto")
      // being uploaded by mistake. Refuse the cell instead of writing it.
      if (cell.value < 0) {
        errors.push(
          `${label} negativo para ${nombre} en ${MONTH_LABELS[i]}: ${cell.value}`
        )
        return
      }
      upserts.push({ bp_id: String(bp.id), mes: i + 1, value: cell.value })
    })
  }
  return { upserts, skippedRows }
}

/**
 * Bulk edit of the two per-BP grids at once. Reads the 'Sueldos' and
 * 'Horas contratadas' sheets written by `exportSueldosYHoras`; either
 * one may be absent, and any other sheet (including the read-only
 * 'Horas asignadas (ref)') is ignored.
 */
export async function importSueldosYHoras(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  const sueldosRows = sheetRowsByName(wb, 'Sueldos')
  const capacidadRows = sheetRowsByName(wb, 'Horas contratadas')

  if (sueldosRows == null && capacidadRows == null) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      message:
        'El archivo no tiene las hojas "Sueldos" ni "Horas contratadas". Descargá la planilla desde "Descargar sueldos y horas" y editá esa.',
    }
  }

  const bpRes = await supabase.from('brand_partners').select('id, nombre')
  if (bpRes.error) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      message: `No se pudo leer BPs: ${bpRes.error.message ?? ''}`,
    }
  }
  const bpByName = indexByName(
    ((bpRes.data ?? []) as { id: string; nombre: string }[])
  )

  const errors: string[] = []
  let skipped = 0

  const sueldos = sueldosRows
    ? parseGridSheet(sueldosRows, 'Sueldo', bpByName, 'Sueldo', errors)
    : { upserts: [], skippedRows: 0 }
  const capacidad = capacidadRows
    ? parseGridSheet(capacidadRows, 'Horas', bpByName, 'Horas contratadas', errors)
    : { upserts: [], skippedRows: 0 }
  skipped = sueldos.skippedRows + capacidad.skippedRows

  if (sueldos.upserts.length === 0 && capacidad.upserts.length === 0) {
    return {
      success: false,
      imported: 0,
      skipped,
      message: `No se importó nada. ${errors[0] ?? 'Las hojas no tienen valores numéricos.'}`,
    }
  }

  // Each sheet goes in one round-trip. The UNIQUE constraints these rely
  // on — sueldos (bp_id, mes) and horas_contratadas (bp_id, mes) — are
  // the same ones the full-year modals use.
  if (sueldos.upserts.length > 0) {
    const { error } = await supabase.from('sueldos').upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sueldos.upserts.map((u) => ({
        bp_id: u.bp_id,
        mes: u.mes,
        sueldo: u.value,
      })) as any,
      { onConflict: 'bp_id,mes' }
    )
    if (error) {
      return {
        success: false,
        imported: 0,
        skipped,
        message: `Upsert de sueldos falló: ${error.message}`,
      }
    }
  }

  if (capacidad.upserts.length > 0) {
    const { error } = await supabase.from('horas_contratadas').upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capacidad.upserts.map((u) => ({
        bp_id: u.bp_id,
        mes: u.mes,
        horas: u.value,
      })) as any,
      { onConflict: 'bp_id,mes' }
    )
    if (error) {
      return {
        success: false,
        // Sueldos already committed above — say so rather than reporting 0.
        imported: sueldos.upserts.length,
        skipped,
        message: `Sueldos OK (${sueldos.upserts.length}), pero el upsert de horas contratadas falló: ${error.message}`,
      }
    }
  }

  const parts: string[] = []
  if (sueldos.upserts.length > 0) parts.push(`${sueldos.upserts.length} sueldos`)
  if (capacidad.upserts.length > 0) {
    parts.push(`${capacidad.upserts.length} horas contratadas`)
  }
  const warn =
    errors.length > 0
      ? ` · ${errors.length} celdas omitidas (${errors[0]}${errors.length > 1 ? '…' : ''})`
      : ''
  return {
    success: true,
    imported: sueldos.upserts.length + capacidad.upserts.length,
    skipped,
    message: `${parts.join(' y ')} actualizados${warn}.`,
  }
}
