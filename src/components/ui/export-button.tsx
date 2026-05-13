import { useState, type ReactNode } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export interface ExportButtonProps {
  label: ReactNode
  /** Async producer: typically refetches data and triggers the download.
   *  Should resolve once the file has been generated. */
  onExport: () => Promise<void>
  disabled?: boolean
}

/**
 * Secondary-variant 'Descargar Excel' button that runs an async export
 * job. Manages a local busy state so the click pulls fresh data without
 * letting the user fire concurrent exports.
 */
export function ExportButton({
  label,
  onExport,
  disabled,
}: ExportButtonProps) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      await onExport()
    } catch (err) {
      toast.error('No se pudo exportar el archivo', {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleClick}
      disabled={disabled || busy}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <FileDown className="w-3.5 h-3.5" />
      )}
      {label}
    </Button>
  )
}
