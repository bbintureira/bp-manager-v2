import { useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Body content rendered after the description. */
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Renders the confirm button in red. */
  destructive?: boolean
  /** Called when the user confirms. May be async; the dialog tracks loading state. */
  onConfirm: () => void | Promise<void>
}

/**
 * Generic confirm modal. Used for destructive flows (delete) but also
 * fine for any "are you sure?" prompt — set `destructive={false}` for the
 * neutral variant.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submitting) return
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && (
              <AlertTriangle
                className="w-4 h-4 text-danger shrink-0"
                aria-hidden
              />
            )}
            <span>{title}</span>
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children && <DialogBody>{children}</DialogBody>}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? 'Procesando…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
