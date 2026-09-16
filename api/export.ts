/**
 * GET /api/export — read-only JSON dump of the whole BP Manager dataset.
 *
 * Machine door for the P&L scripts and dashboards: same numbers the UI
 * shows, no scraping and no Excel round-trip. Every figure is produced by
 * the very same functions the pages call (`src/lib/calculations.ts`), so
 * fidelity is structural rather than re-implemented here.
 *
 * Auth: `Authorization: Bearer <EXPORT_TOKEN>`. The token is never read
 * from the query string — that would leak it into access logs.
 *
 * NOTE on `?year=`: the schema has no year column (`mes` is 1-12 and that
 * is all). The param is accepted and echoed back, but it cannot filter —
 * see `meta.nota` in the response and the schema notes in CLAUDE.md.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

// NO SACAR la extensión `.js` de los imports relativos de abajo. El proyecto
// es `"type": "module"`, y el runtime de Node de Vercel compila esta función
// sin bundlear: `api/export.ts` y `src/lib/calculations.ts` salen como dos
// `.js` separados en /var/task y se resuelven con ESM puro, que exige la
// extensión explícita. Sin ella la función muere al cargar el módulo
// (ERR_MODULE_NOT_FOUND) y TODA invocación devuelve 500 — ni siquiera llega a
// contestar 401 o 405. En TypeScript el `.js` resuelve al `.ts` igual, así que
// `npm run build` no se entera; el fallo sólo aparece deployado.
import {
  bpHorasMonthRow,
  bpRentabilidadMonthRow,
  getMesIngreso,
  summarizeAllProjects,
  type CapacidadMensual,
} from '../src/lib/calculations.js'
import type {
  Asignacion,
  BrandPartner,
  Id,
  Proyecto,
  Sueldo,
} from '../src/lib/queries.js'

// --- Vercel Node handler signature ----------------------------------------
// Typed locally so the repo doesn't need `@vercel/node` just for two
// interfaces (the runtime object has plenty more; we only touch these).

interface ApiRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string | string[] | undefined>
}

interface ApiResponse {
  status(code: number): ApiResponse
  json(body: unknown): void
  setHeader(name: string, value: string): void
}

// --- Supabase REST access -------------------------------------------------

/** Read at call time, not module load, so a cold start that races the
 *  env injection can't cache empty strings. */
function supabaseEnv(): { url: string; key: string } {
  return {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
    key:
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      process.env.VITE_SUPABASE_ANON_KEY ??
      '',
  }
}

/** PostgREST caps a plain select at 1000 rows. `asignaciones` blows past
 *  that (BPs × proyectos × 12), so every table is read page by page. */
const PAGE_SIZE = 1000

async function fetchAll<T>(table: string, select = '*'): Promise<T[]> {
  const { url: baseUrl, key } = supabaseEnv()
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${baseUrl}/rest/v1/${table}` +
      `?select=${encodeURIComponent(select)}` +
      `&limit=${PAGE_SIZE}&offset=${offset}`
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      throw new Error(
        `Supabase ${table} → ${res.status} ${await res.text().catch(() => '')}`
      )
    }
    const page = (await res.json()) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

/** `mes` / numeric columns can come back as strings depending on the
 *  Postgres type — same defensive coercion `queries.ts` does. */
function toMonthlyRows<K extends string>(
  raw: Record<string, unknown>[],
  valueKey: K
): { proyecto_id: Id; mes: number; [k: string]: unknown }[] {
  return raw.map((r) => ({
    proyecto_id: r.proyecto_id as Id,
    mes: Number(r.mes),
    [valueKey]: Number(r[valueKey]) || 0,
  }))
}

// --- helpers --------------------------------------------------------------

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** Money / percentages to 2 decimals; hours stay whole. Avoids dumping
 *  floating-point noise like 3815655.9999999995 into the payload. */
const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const rH = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100

const same = (a: Id, b: Id) => String(a) === String(b)

/** Constant-time token comparison. Both sides are hashed first so the
 *  compare is fixed-width and the token length doesn't leak. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function bearerFrom(headers: ApiRequest['headers']): string | null {
  const raw = headers.authorization ?? headers.Authorization
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  const m = /^Bearer\s+(.+)$/i.exec(value.trim())
  return m ? m[1].trim() : null
}

/** Shape of one BP entry in the payload. Declared explicitly so the
 *  totals block below can be typed off it. */
interface BpExportRow {
  id: string
  nombre: string
  activo: boolean
  /** Assigned hours OR an explicit `horas_contratadas` row > 0 this mes.
   *  Contracted-but-unassigned BPs are in with `asignadas: 0` and their
   *  whole sueldo as `sueldo_ocioso`. */
  tiene_actividad: boolean
  desde: string
  contratadas: number
  asignadas: number
  libres: number
  sueldo: number
  ingreso_cotizado: number
  sueldo_ocupado: number
  sueldo_ocioso: number
  margen: number
  margen_pct: number
  cobertura_salarial: number
  dif_comercial_horas: number
  dif_comercial_pesos: number
  asignaciones: { proyecto: string; horas: number }[]
}

// --- handler --------------------------------------------------------------

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' })
    return
  }

  const expected = process.env.EXPORT_TOKEN ?? ''
  if (!expected) {
    res
      .status(500)
      .json({ error: 'EXPORT_TOKEN no está configurado en el servidor.' })
    return
  }
  const provided = bearerFrom(req.headers)
  if (!provided || !tokenMatches(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { url: supabaseUrl, key: supabaseKey } = supabaseEnv()
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'Faltan las credenciales de Supabase.' })
    return
  }

  const rawYear = Array.isArray(req.query.year)
    ? req.query.year[0]
    : req.query.year
  const year = Number(rawYear) || new Date().getFullYear()

  try {
    const [
      proyectos,
      brandPartners,
      asignaciones,
      sueldosRaw,
      honorariosRaw,
      horasRaw,
      capacidadesRaw,
    ] = await Promise.all([
      fetchAll<Proyecto>('proyectos'),
      fetchAll<BrandPartner>('brand_partners'),
      fetchAll<Asignacion>('asignaciones'),
      fetchAll<Sueldo>('sueldos'),
      fetchAll<Record<string, unknown>>(
        'proyecto_honorarios_mensuales',
        'proyecto_id,mes,honorarios'
      ),
      fetchAll<Record<string, unknown>>(
        'horas_proyecto',
        'proyecto_id,mes,horas'
      ),
      fetchAll<Record<string, unknown>>(
        'horas_contratadas',
        'bp_id,mes,horas'
      ),
    ])

    // `mes` arrives as a string on some deployments; the calculation layer
    // compares it with `===` against a number, so coerce up front.
    const sueldos: Sueldo[] = sueldosRaw.map((s) => ({
      ...s,
      mes: Number(s.mes),
      sueldo: Number(s.sueldo) || 0,
    }))
    const asignacionesNorm: Asignacion[] = asignaciones.map((a) => ({
      ...a,
      mes: Number(a.mes),
      horas: Number(a.horas) || 0,
    }))
    const honorariosMensuales = toMonthlyRows(
      honorariosRaw,
      'honorarios'
    ) as { proyecto_id: Id; mes: number; honorarios: number }[]
    const horasMensuales = toMonthlyRows(horasRaw, 'horas') as {
      proyecto_id: Id
      mes: number
      horas: number
    }[]
    // Per-BP monthly contracted capacity (`horas_contratadas`). Months with
    // no row fall back to the BP's scalar, then to 160 — same rule the UI
    // applies, so `contratadas` matches the Horas tab month by month.
    const capacidades: CapacidadMensual[] = capacidadesRaw.map((r) => ({
      bp_id: r.bp_id as Id,
      mes: Number(r.mes),
      horas: Number(r.horas) || 0,
    }))

    const months: Record<string, unknown> = {}

    for (const mes of MONTHS) {
      // --- BPs ------------------------------------------------------------
      const bpsOut: BpExportRow[] = []
      for (const bp of brandPartners) {
        const horas = bpHorasMonthRow(
          bp,
          asignacionesNorm,
          proyectos,
          mes,
          sueldos,
          capacidades
        )
        const rent = bpRentabilidadMonthRow(
          bp,
          asignacionesNorm,
          sueldos,
          proyectos,
          honorariosMensuales,
          mes,
          horasMensuales,
          capacidades
        )
        // "BP con datos en el mes": activity (worked hours OR contracted
        // capacity on file), or a sueldo actually loaded for that mes.
        // Inactive BPs are included — the `activo` flag tells the consumer
        // which is which.
        const tieneSueldoRow = sueldos.some(
          (s) => s.mes === mes && same(s.bp_id, bp.id) && Number(s.sueldo) > 0
        )
        if (!horas.tieneActividad && !tieneSueldoRow) continue

        const mesIngreso = getMesIngreso(bp)
        bpsOut.push({
          id: String(bp.id),
          nombre: bp.nombre,
          activo: bp.activo !== false,
          tiene_actividad: horas.tieneActividad,
          desde: bp.fecha_ingreso
            ? bp.fecha_ingreso.slice(0, 7)
            : `${year}-${String(mesIngreso).padStart(2, '0')}`,
          contratadas: rH(horas.horasContratadas),
          asignadas: rH(horas.horasAsignadas),
          // Signed: negative = sobreasignado (same as the LIBRES column).
          libres: rH(horas.horasLibres),
          sueldo: r2(rent.sueldoMensual),
          ingreso_cotizado: r2(rent.ingresoCotizado),
          // "Sueldo ocupado": costo de las horas efectivamente asignadas.
          sueldo_ocupado: r2(rent.costo),
          // "Sueldo ocioso": sueldo − sueldo ocupado.
          sueldo_ocioso: r2(rent.sueldoOcioso),
          // margen === "diferencia cubierto vs ocupado" (ingreso − costo).
          margen: r2(rent.margen),
          margen_pct: r2(rent.margenPercent),
          cobertura_salarial: r2(rent.coberturaSalarial),
          dif_comercial_horas: rH(rent.diferenciaComercialHoras),
          dif_comercial_pesos: r2(rent.diferenciaComercial),
          asignaciones: horas.byProject.map((p) => ({
            proyecto: p.proyecto_name,
            horas: rH(p.horas),
          })),
        })
      }
      bpsOut.sort((a, b) => a.nombre.localeCompare(b.nombre))

      // --- Proyectos --------------------------------------------------------
      // Same visibility rule as the monthly project table: hours assigned
      // OR booked honorarios. Empty / future projects drop out.
      const proyectosOut = summarizeAllProjects(
        proyectos,
        asignacionesNorm,
        sueldos,
        mes,
        brandPartners,
        honorariosMensuales,
        horasMensuales,
        capacidades
      )
        .filter((p) => p.totalHoras > 0 || p.revenue > 0)
        .map((p) => ({
          id: String(p.proyecto.id),
          proyecto: p.proyecto.nombre,
          horas_contratadas: rH(p.horasCotizadas),
          horas_asignadas: rH(p.totalHoras),
          diferencia_horas: rH(p.diffHorasComercial),
          diferencia_pesos: r2(p.diffPlataComercial),
          ingresos: r2(p.revenue),
          costos: r2(p.cost),
          margen: r2(p.marginAbsolute),
          margen_pct: r2(p.marginPercent),
          bps: p.bps,
        }))
        .sort((a, b) => a.proyecto.localeCompare(b.proyecto))

      // Totals mirror the dashboard KPIs (filtro "Todos"): BPs with
      // activity that month — projects assigned OR contracted capacity on
      // file. `bps_con_asignaciones` keeps its original meaning (count of
      // BPs with projects); `bps_con_actividad` is the base of the sums.
      const conActividad = bpsOut.filter((b) => b.tiene_actividad)
      const conAsignaciones = bpsOut.filter((b) => b.asignaciones.length > 0)
      const sum = (rows: BpExportRow[], pick: (r: BpExportRow) => number) =>
        rows.reduce((s, r) => s + pick(r), 0)

      months[String(mes)] = {
        bps: bpsOut,
        proyectos: proyectosOut,
        totales: {
          bps_con_asignaciones: conAsignaciones.length,
          bps_con_actividad: conActividad.length,
          horas_contratadas: rH(sum(conActividad, (r) => r.contratadas)),
          horas_asignadas: rH(sum(conActividad, (r) => r.asignadas)),
          sueldo: r2(sum(conActividad, (r) => r.sueldo)),
          ingreso_cotizado: r2(
            sum(conActividad, (r) => r.ingreso_cotizado)
          ),
          sueldo_ocupado: r2(sum(conActividad, (r) => r.sueldo_ocupado)),
          sueldo_ocioso: r2(sum(conActividad, (r) => r.sueldo_ocioso)),
          margen: r2(sum(conActividad, (r) => r.margen)),
          cobertura_salarial: r2(
            sum(conActividad, (r) => r.cobertura_salarial)
          ),
          proyectos_diferencia_horas: rH(
            proyectosOut.reduce((s, p) => s + p.diferencia_horas, 0)
          ),
          proyectos_diferencia_pesos: r2(
            proyectosOut.reduce((s, p) => s + p.diferencia_pesos, 0)
          ),
        },
      }
    }

    res.status(200).json({
      generated_at: new Date().toISOString(),
      year,
      meta: {
        year_filtrado: false,
        nota:
          'El esquema no tiene columna de año: `mes` es 1-12 y nada más. ' +
          '`year` se acepta y se devuelve, pero no filtra — los datos son ' +
          'los cargados en la app.',
        moneda: 'ARS',
        actividad:
          'Un BP entra en el mes (y en `totales`) si tiene horas asignadas ' +
          'o una fila de horas contratadas > 0. Sin asignaciones, sus horas ' +
          'contratadas son ociosas y su sueldo completo es `sueldo_ocioso`. ' +
          'Ver `tiene_actividad` por BP.',
        fuente: 'bp-manager · mismas fórmulas que la UI (src/lib/calculations.ts)',
      },
      months,
    })
  } catch (e) {
    console.error('[api/export] failed', e)
    res.status(502).json({
      error: 'No se pudieron leer los datos.',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
