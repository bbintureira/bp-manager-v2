// Formatters with es-AR locale (thousands "." / decimal ",").
// Currency is composed manually so we get "$48.230" with no space
// between symbol and number — Intl currency style emits a NBSP we
// don't want for compact dashboard cells.

const numberAR = (decimals = 0) =>
  new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

export function formatCurrency(value: number, decimals = 0): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${numberAR(decimals).format(Math.abs(value))}`
}

export function formatNumber(value: number, decimals = 2): string {
  return numberAR(decimals).format(value)
}

/** value is given as a percentage already (e.g. 34.8 → "34,8%"). */
export function formatPercent(value: number, decimals = 1): string {
  return `${numberAR(decimals).format(value)}%`
}

/** value in pp delta format, e.g. 2.3 → "2,3pp" */
export function formatPp(value: number, decimals = 1): string {
  return `${numberAR(decimals).format(value)}pp`
}

export function formatHours(value: number): string {
  return `${numberAR(0).format(value)}h`
}

/**
 * Compact currency, optimized for narrow KPI cells:
 *   1.234.567 → "$1,2M"      (millions, 1 decimal)
 *   12.345    → "$12K"       (thousands, no decimals)
 *   123       → "$123"       (raw)
 * Negative values keep the sign.
 */
export function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    return `${sign}$${numberAR(1).format(abs / 1_000_000)}M`
  }
  if (abs >= 10_000) {
    return `${sign}$${numberAR(0).format(abs / 1_000)}K`
  }
  return formatCurrency(value, 0)
}

/** Compact hours: 1.234 → "1,2K h", 234 → "234h". */
export function formatCompactHours(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000) {
    return `${sign}${numberAR(1).format(abs / 1_000)}K h`
  }
  return formatHours(value)
}
