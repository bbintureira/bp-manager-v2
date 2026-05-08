import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  EmptyState,
  ErrorBanner,
  TableSkeleton,
} from '@/components/ui/loading-states'
import {
  createGrouper,
  deleteGrouper,
  getGroupers,
  updateGrouper,
  type Grouper,
} from '@/lib/queries'

interface GroupersManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after any add/delete commits, so the parent can refresh its
   * cached grouper list. */
  onChanged?: () => void
}

/**
 * Manages the canonical list of groupers used by the BP forms. Keeping the
 * list small and curated avoids "Marketing" / "marketing" / "Mkt" drift.
 */
export function GroupersManagerDialog({
  open,
  onOpenChange,
  onChanged,
}: GroupersManagerDialogProps) {
  const [groupers, setGroupers] = useState<Grouper[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const [deleting, setDeleting] = useState<Grouper | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await getGroupers()
      setGroupers(rows)
    } catch (e) {
      console.error('[groupers] load failed', e)
      setError('No se pudo cargar la lista.')
      setGroupers(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (adding) return
    const trimmed = newName.trim()
    if (!trimmed) return
    setAdding(true)
    const result = await createGrouper(trimmed)
    setAdding(false)
    if (result.success) {
      toast.success(`${result.data.nombre} agregado`)
      setNewName('')
      onChanged?.()
      void load()
    } else {
      toast.error('No se pudo agregar', { description: result.error })
    }
  }

  async function onDelete() {
    if (!deleting) return
    const result = await deleteGrouper(deleting.id)
    if (result.success) {
      toast.success(`${deleting.nombre} eliminado`)
      setDeleting(null)
      onChanged?.()
      void load()
    } else {
      toast.error('No se pudo eliminar', { description: result.error })
    }
  }

  function startEdit(g: Grouper) {
    setEditingId(g.id)
    setEditValue(g.nombre)
  }
  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
  }
  async function commitEdit(g: Grouper) {
    const next = editValue.trim()
    if (!next || next === g.nombre) {
      cancelEdit()
      return
    }
    setSavingEdit(true)
    const result = await updateGrouper(g.id, next)
    setSavingEdit(false)
    if (result.success) {
      toast.success(`${g.nombre} → ${next}`)
      cancelEdit()
      onChanged?.()
      void load()
    } else {
      toast.error('No se pudo renombrar', { description: result.error })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Gestionar groupers</DialogTitle>
            <DialogDescription>
              Lista canónica de groupers. Los BPs eligen de acá para que no
              se cuelen typos como “marketing” vs “Marketing”.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {error && <ErrorBanner message={error} />}

            <form
              onSubmit={onAdd}
              className="grid grid-cols-[1fr_auto] gap-2 items-end"
            >
              <Field id="g-name" label="Nuevo grouper" required>
                <Input
                  id="g-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Marketing · Tech · Producto…"
                  disabled={adding}
                  required
                />
              </Field>
              <Button type="submit" disabled={adding || !newName.trim()}>
                {adding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Agregar
              </Button>
            </form>

            <div className="bg-base border border-border rounded-md mt-2">
              {loading ? (
                <TableSkeleton rows={3} />
              ) : !groupers || groupers.length === 0 ? (
                <EmptyState message="Todavía no hay groupers cargados." />
              ) : (
                <ul>
                  {groupers.map((g) => {
                    const isEditing = editingId === g.id
                    return (
                      <li
                        key={g.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border last:border-0"
                      >
                        {isEditing ? (
                          <>
                            <Input
                              autoFocus
                              value={editValue}
                              disabled={savingEdit}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  void commitEdit(g)
                                } else if (e.key === 'Escape') {
                                  e.preventDefault()
                                  cancelEdit()
                                }
                              }}
                              className="flex-1"
                            />
                            <button
                              type="button"
                              aria-label="Guardar"
                              title="Guardar"
                              disabled={savingEdit || !editValue.trim()}
                              onClick={() => void commitEdit(g)}
                              className="grid place-items-center w-7 h-7 rounded-md text-success hover:bg-success-soft transition-colors disabled:opacity-50"
                            >
                              {savingEdit ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label="Cancelar"
                              title="Cancelar"
                              disabled={savingEdit}
                              onClick={cancelEdit}
                              className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:bg-hover transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-md flex-1">
                              {g.nombre}
                            </span>
                            <button
                              type="button"
                              aria-label={`Renombrar ${g.nombre}`}
                              title="Renombrar"
                              onClick={() => startEdit(g)}
                              className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-primary hover:bg-hover transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Eliminar ${g.nombre}`}
                              title="Eliminar"
                              onClick={() => setDeleting(g)}
                              className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminar grouper"
        description={
          deleting ? (
            <>
              Borra <strong>{deleting.nombre}</strong> de la lista. Los BPs
              que lo tenían asignado quedan sin grouper.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDelete}
      />
    </>
  )
}
