import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * shadcn-compatible className helper: dedupes Tailwind classes so that
 * the last duplicate wins (e.g. `cn('p-2', condition && 'p-4')`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
