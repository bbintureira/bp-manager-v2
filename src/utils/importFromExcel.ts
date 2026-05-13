import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

/**
 * Excel importers — one per dashboard section. Each parses the first
 * worksheet of the uploaded file using the column headers that the
 * matching exporter writes, then upserts into Supabase. Rows whose
 * referenced entity (project / BP / grouper) can't be resolved by
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
  const wb = XLSX.read(buf, { type: 'array' })
  const name = wb.SheetNames[0]
  if (!name) return []
  const ws = wb.Sheets[name]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: false,
  })
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
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const nombre = trimStr(row['Nombre'])
    if (!nombre) {
      skipped++
      continue
    }
    const tipo = trimStr(row['Tipo']) || null
    const status = trimStr(row['Estado']) || 'activo'
    const fecha_inicio = parseDateLoose(row['Fecha inicio'])

    // Pre-compute the per-month grids and scalar averages.
    const honMonths: number[] = []
    const horasMonths: number[] = []
    let honSum = 0
    let honCount = 0
    let horasSum = 0
    let horasCount = 0
    for (let i = 0; i < 12; i++) {
      const h = toNum(row[`Honorario ${MONTH_LABELS[i]}`])
      const hr = toNum(row[`Horas ${MONTH_LABELS[i]}`])
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
      const { error } = await supabase
        .from('proyectos')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(baseFields as any)
        .eq('id', proyecto_id)
      if (error) {
        skipped++
        errors.push(`${nombre}: ${error.message}`)
        continue
      }
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
    }

    // Per-month honorarios + horas. Send the whole 12-row batch even if
    // some are zero — keeps the table consistent with the file.
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
    const [{ error: honErr }, { error: horasErr }] = await Promise.all([
      supabase
        .from('proyecto_honorarios_mensuales')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(honRows as any, { onConflict: 'proyecto_id,mes' }),
      supabase
        .from('horas_proyecto')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(horasRows as any, { onConflict: 'proyecto_id,mes' }),
    ])
    if (honErr || horasErr) {
      skipped++
      errors.push(
        `${nombre}: ${(honErr ?? horasErr)?.message ?? 'monthly upsert failed'}`
      )
      continue
    }
    imported++
  }

  const message =
    imported === 0
      ? `Sin proyectos importados. ${errors[0] ?? ''}`.trim()
      : `${imported} proyectos importados${skipped > 0 ? ` · ${skipped} con errores` : ''}.`
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
  seniority: string | null
  grouper_id: string | null
  activo: boolean | null
}

interface GrouperRow {
  id: string
  nombre: string
}

export async function importBrandPartners(file: File): Promise<ImportResult> {
  const rows = await readSheet(file)
  if (rows.length === 0) {
    return { success: false, imported: 0, skipped: 0, message: 'El archivo está vacío.' }
  }

  const [bpRes, grRes] = await Promise.all([
    supabase
      .from('brand_partners')
      .select('id, nombre, seniority, grouper_id, activo'),
    supabase.from('groupers').select('id, nombre'),
  ])
  if (bpRes.error || grRes.error) {
    return {
      success: false,
      imported: 0,
      skipped: rows.length,
      message: `No se pudo leer BPs / groupers: ${(bpRes.error ?? grRes.error)?.message ?? ''}`,
    }
  }
  const bpByName = indexByName(((bpRes.data ?? []) as BPRow[]))
  const grByName = indexByName(((grRes.data ?? []) as GrouperRow[]))

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const nombre = trimStr(row['Nombre'])
    if (!nombre) {
      skipped++
      continue
    }
    const celulaName = trimStr(row['Célula']) || trimStr(row['Celula'])
    let grouper_id: string | null = null
    if (celulaName) {
      const gr = grByName.get(celulaName.toLowerCase())
      grouper_id = gr ? String(gr.id) : null
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
        .update({ nombre, grouper_id } as any)
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
        .insert({ nombre, grouper_id, activo: true } as any)
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
    const proyectoName = trimStr(row['Proyecto'])
    const bpName = trimStr(row['BP'])
    const mes = mesFromLabel(row['Mes'])
    const horas = toNum(row['Horas asignadas'])

    if (!proyectoName || !bpName) {
      skipped++
      continue
    }
    if (mes < 1 || mes > 12) {
      skipped++
      errors.push(`Mes inválido para ${bpName} / ${proyectoName}: ${row['Mes']}`)
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
