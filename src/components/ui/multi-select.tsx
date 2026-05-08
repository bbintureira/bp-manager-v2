import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  value: string
  label: ReactNode
}

export interface MultiSelectProps {
  /** Selected values. Empty array means "none selected" — but the trigger
   * shows "Todas" / `allLabel` when `value.length === options.length`. */
  value: string[]
  onChange: (next: string[]) => void
  options: MultiSelectOption[]
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string
  /** Shown in the trigger when ALL options are selected. */
  allLabel?: string
  /** Visible label for the master "select all" checkbox at the top. */
  allOptionLabel?: string
  ariaLabel?: string
  className?: string
}

/**
 * Native-ish dropdown that lets the user check multiple options. The
 * trigger renders like the existing `Select` (chevron, same colors) so
 * it sits next to other filter controls in the topbar without standing
 * out. The panel is plain absolute-positioned — closes on outside click
 * or Escape.
 */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = 'Elegir…',
  allLabel = 'Todas',
  allOptionLabel = 'Todas',
  ariaLabel,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const allSelected = value.length === options.length && options.length > 0
  const noneSelected = value.length === 0

  function toggleAll() {
    if (allSelected) onChange([])
    else onChange(options.map((o) => o.value))
  }

  function toggle(val: string) {
    if (value.includes(val)) onChange(value.filter((v) => v !== val))
    else onChange([...value, val])
  }

  // Trigger label
  const label = allSelected
    ? allLabel
    : noneSelected
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} seleccionados`

  return (
    <div ref={wrapperRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-2 h-10 pl-3 pr-8 rounded-md border border-border bg-base',
          'text-sm text-primary hover:bg-hover transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:border-accent',
          'min-w-[160px] relative'
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          aria-hidden
          className="absolute right-2 w-3.5 h-3.5 text-tertiary pointer-events-none"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className={cn(
            'absolute z-30 mt-1 min-w-full max-w-[260px] rounded-md border border-border bg-elevated shadow-xl',
            'p-1 flex flex-col'
          )}
        >
          <CheckRow
            checked={allSelected}
            indeterminate={!allSelected && !noneSelected}
            label={allOptionLabel}
            onToggle={toggleAll}
            emphasize
          />
          <div className="h-px bg-border my-1" />
          {options.map((o) => (
            <CheckRow
              key={o.value}
              checked={value.includes(o.value)}
              label={o.label}
              onToggle={() => toggle(o.value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CheckRow({
  checked,
  indeterminate,
  label,
  onToggle,
  emphasize,
}: {
  checked: boolean
  indeterminate?: boolean
  label: ReactNode
  onToggle: () => void
  emphasize?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm transition-colors text-left',
        'hover:bg-hover',
        emphasize && 'font-medium'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid place-items-center w-4 h-4 rounded-sm border border-border bg-base shrink-0',
          'transition-colors',
          (checked || indeterminate) && 'bg-accent border-accent'
        )}
      >
        {checked ? (
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        ) : indeterminate ? (
          <span aria-hidden className="block w-2 h-0.5 bg-white rounded-sm" />
        ) : null}
      </span>
      <span className="text-primary">{label}</span>
    </button>
  )
}
