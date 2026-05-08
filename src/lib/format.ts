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
