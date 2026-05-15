import { useRef, useState, type ReactNode } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ImportResult } from '@/utils/importFromExcel'

export interface UploadButtonProps {
  label: ReactNode
  /** File picker filter; defaults to `.xlsx`. */
  accept?: string
  /** Called with the selected file; returns the importer's result so the
   *  button can surface success/error toasts uniformly. */
  onFile: (file: File) => Promise<ImportResult>
  /** Fired once the import finishes successfully — used by callers to
   *  refresh the page state. If it returns a promise, the busy spinner
   *  stays on until the refresh resolves. */
  onComplete?: () => void | Promise<void>
  disabled?: boolean
}

/**
 * Secondary-variant button that opens an `<input type="file">` and runs
 * `onFile` on the selected file. Manages busy state + toasts locally so
 * each page can drop in two lines (label + handler).
 */
export function UploadButton({
  label,
  accept = '.xlsx',
  onFile,
  onComplete,
  disabled,
}: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so picking the same file twice in a row still fires onChange.
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const result = await onFile(file)
      if (result.success) {
        toast.success(result.message)
        // Await the caller's refresh so the spinner stays on for the
        // full round-trip — release-with-stale-UI was the reason
        // uploads looked like no-ops.
        await onComplete?.()
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error('No se pudo importar el archivo', {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        {label}
      </Button>
    </>
  )
}
