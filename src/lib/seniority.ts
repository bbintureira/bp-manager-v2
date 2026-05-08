import type { BrandPartner, Id, Sueldo } from './queries'

/**
 * Seniority is derived from the BP's monthly salary (ARS).
 * Ranges are inclusive of `min` and exclusive of the next bucket's `min`.
 * Iterated highest-to-lowest so a sueldo only matches the top tier it
 * qualifies for.
 *
 * Note: there are intentional "gaps" in the user-provided spec
 * (e.g. 3.800.001–3.899.999); we treat those as falling into the lower
 * bucket since only `min` thresholds gate the next tier upwards.
 */
export const SENIORITY_RANGES = [
  { label: 'Super Sr', min: 4_600_000 },
  { label: 'Sr', min: 3_900_000 },
  { label: 'Semi Sr', min: 2_700_000 },
  { label: 'Junior', min: 0 },
] as const

export type Seniority = (typeof SENIORITY_RANGES)[number]['label']

export function seniorityFromSueldo(sueldo: number): Seniority | null {
  if (!Number.isFinite(sueldo) || sueldo <= 0) return null
  for (const r of SENIORITY_RANGES) {
    if (sueldo >= r.min) return r.label
  }
  return 'Junior'
}

/**
 * Picks the BP's "current" sueldo from the sueldos table:
 *  - if `mes` is provided, the sueldo for that mes
 *  - else, the latest non-zero sueldo on file (highest mes)
 *  - 0 if nothing matches.
 */
export function pickSueldoForBP(
  bpId: Id,
  sueldos: Sueldo[],
  mes?: number
): number {
  const own = sueldos.filter((s) => String(s.bp_id) === String(bpId))
  if (mes !== undefined) {
    const row = own.find((s) => s.mes === mes)
    return row ? Number(row.sueldo) || 0 : 0
  }
  const nonZero = own.filter((s) => Number(s.sueldo) > 0)
  if (nonZero.length === 0) return 0
  const sorted = [...nonZero].sort((a, b) => Number(b.mes) - Number(a.mes))
  return Number(sorted[0].sueldo) || 0
}

/** Convenience: derive seniority for a BP given the sueldos table. */
export function seniorityForBP(
  bp: BrandPartner,
  sueldos: Sueldo[],
  mes?: number
): Seniority | null {
  return seniorityFromSueldo(pickSueldoForBP(bp.id, sueldos, mes))
}

/**
 * Display-time seniority resolver: prefers live derivation from
 * `sueldo_mensual` (so new tier ranges apply immediately to existing
 * data); falls back to the persisted `seniority` column when there's no
 * sueldo on file.
 */
export function displaySeniority(bp: {
  sueldo_mensual?: number | null
  seniority?: string | null
}): string | null {
  const sueldo = bp.sueldo_mensual
  if (typeof sueldo === 'number' && sueldo > 0) {
    return seniorityFromSueldo(sueldo)
  }
  return bp.seniority ?? null
}
