import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2, MailPlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Section } from '@/components/ui/section'
import {
  EmptyState,
  ErrorBanner,
  TableSkeleton,
} from '@/components/ui/loading-states'
import {
  addAllowedEmail,
  deleteAllowedEmail,
  getAllowedEmails,
  type AllowedEmail,
} from '@/lib/queries'

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function AllowedEmailsManager() {
  const [emails, setEmails] = useState<AllowedEmail[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [adding, setAdding] = useState(false)

  const [deleting, setDeleting] = useState<AllowedEmail | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await getAllowedEmails()
      setEmails(rows)
    } catch (e) {
      console.error('[admin] load allowlist failed', e)
      setError('No se pudo cargar el allowlist.')
      setEmails(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (adding) return
    const trimmed = newEmail.trim()
    if (!trimmed) return
    setAdding(true)
    const result = await addAllowedEmail(trimmed)
    setAdding(false)
    if (result.success) {
      toast.success(`${result.data.email} agregado`)
      setNewEmail('')
      void load()
    } else {
      toast.error('No se pudo agregar', { description: result.error })
    }
  }

  async function onDelete() {
    if (!deleting) return
    const result = await deleteAllowedEmail(deleting.id)
    if (result.success) {
      toast.success(`${deleting.email} removido`)
      setDeleting(null)
      void load()
    } else {
      toast.error('No se pudo eliminar', { description: result.error })
    }
  }

  return (
    <>
      {error && <ErrorBanner message={error} />}

      <Section title="Agregar email">
        <form
          onSubmit={onAdd}
          className="grid grid-cols-[1fr_auto] gap-3 items-end"
        >
          <Field id="add-email" label="Email" required>
            <Input
              id="add-email"
              type="email"
              autoComplete="off"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@empresa.com"
              disabled={adding}
            />
          </Field>
          <Button type="submit" disabled={adding || !newEmail.trim()}>
            {adding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <MailPlus className="w-3.5 h-3.5" />
            )}
            {adding ? 'Agregando…' : 'Agregar'}
          </Button>
        </form>
      </Section>

      <div className="mt-5">
        <Section
          title={`Emails autorizados · ${emails?.length ?? 0}`}
          flush
        >
          {loading ? (
            <TableSkeleton rows={4} />
          ) : !emails || emails.length === 0 ? (
            <EmptyState message="Todavía no hay emails en el allowlist." />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="bg-base border-b border-border px-5 py-2.5 text-2xs font-medium uppercase tracking-wider text-tertiary text-left">
                    Email
                  </th>
                  <th className="bg-base border-b border-border px-5 py-2.5 text-2xs font-medium uppercase tracking-wider text-tertiary text-left">
                    Agregado
                  </th>
                  <th className="bg-base border-b border-border px-5 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {emails.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3 align-middle">
                      <span className="font-medium font-mono text-primary">
                        {row.email}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle text-secondary text-2xs">
                      {row.created_at
                        ? dateFmt.format(new Date(row.created_at))
                        : '—'}
                    </td>
                    <td className="px-5 py-3 align-middle text-right">
                      <button
                        type="button"
                        aria-label={`Eliminar ${row.email}`}
                        title="Eliminar"
                        onClick={() => setDeleting(row)}
                        className="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Quitar del allowlist"
        description={
          deleting ? (
            <>
              Se borra <strong>{deleting.email}</strong> de la lista. La
              próxima vez que esa cuenta intente entrar, se le va a denegar
              el acceso.
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
