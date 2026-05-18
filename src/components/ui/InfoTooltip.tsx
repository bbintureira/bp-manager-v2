// Usage:
// import { InfoTooltip } from '@/components/ui/InfoTooltip'
// import { TOOLTIPS } from '@/constants/tooltips'
//
// <span className="inline-flex items-center gap-1">
//   Margen total
//   <InfoTooltip text={TOOLTIPS.margenTotal} />
// </span>

import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InfoTooltipProps {
  /** Tooltip body text. */
  text: string
  /** Screen-reader label for the trigger. Defaults to "Más información". */
  ariaLabel?: string
  /** Extra classes for the trigger button (e.g. spacing). */
  className?: string
}

interface Position {
  top: number
  left: number
}

export function InfoTooltip({
  text,
  ariaLabel = 'Más información',
  className,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Position | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const id = useId()

  // Measure trigger + tooltip and pick a placement (top preferred, bottom
  // fallback) that keeps the card inside the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger || !tooltip) return

    const tr = trigger.getBoundingClientRect()
    const tt = tooltip.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const M = 8

    const spaceAbove = tr.top
    const spaceBelow = vh - tr.bottom
    const placeAbove =
      spaceAbove >= tt.height + M || spaceAbove > spaceBelow
    const top = placeAbove
      ? tr.top - tt.height - M
      : tr.bottom + M

    const triggerCenter = tr.left + tr.width / 2
    let left = triggerCenter - tt.width / 2
    if (left < M) left = M
    if (left + tt.width > vw - M) left = vw - M - tt.width

    setPos({ top, left })
  }, [open, text])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          'inline-grid place-items-center align-middle w-3.5 h-3.5 rounded-full',
          'text-blue-500 hover:text-blue-600 transition-colors',
          'focus-visible:outline-none focus-visible:text-blue-700',
          className
        )}
      >
        <Info className="w-3.5 h-3.5" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            style={
              pos
                ? { position: 'fixed', top: pos.top, left: pos.left }
                : // First paint: render off-screen so we can measure
                  // before placing. The layout effect runs synchronously
                  // before the browser commits, so users never see this.
                  { position: 'fixed', top: -9999, left: -9999 }
            }
            className={cn(
              'z-50 w-max max-w-[280px] pointer-events-none',
              'px-3 py-2 rounded-md shadow-lg',
              'bg-[#0f172a] text-white border border-white/10',
              'text-xs leading-snug'
            )}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  )
}
