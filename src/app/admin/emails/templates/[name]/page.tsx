'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Spinner from '@/components/Spinner'
import Icon from '@/components/ui/Icon'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useConfirm } from '@/hooks/useConfirm'
import { useToast } from '@/hooks/useToast'
import { inputClass, labelClass } from '../../../content/components/fields'
import EmailFrame from '../components/EmailFrame'
import type { AdminEmail, EmailCopy, EmailPreview } from '../components/types'

type FieldKey = keyof EmailCopy

/**
 * Edits one email's copy with a live preview. The preview renders on the
 * server, through the same code that sends the mail, so what it shows is what
 * goes out. "Δοκιμή" mails the unsaved draft to the signed-in admin.
 */
export default function EmailTemplateEditor() {
  const { name } = useParams<{ name: string }>()
  const confirm = useConfirm()
  const toast = useToast()
  const { run, isPending } = useAsyncTask()

  const [email, setEmail] = useState<AdminEmail | null>(null)
  const [draft, setDraft] = useState<EmailCopy | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [preview, setPreview] = useState<EmailPreview | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)

  // The field a token chip inserts into, and where its caret was.
  const focused = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null)

  useEffect(() => {
    fetch(`/api/admin/emails/templates/${name}/`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Το email δεν βρέθηκε.')
        setEmail(data.email)
        setDraft(data.email.copy)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Αποτυχία φόρτωσης.'))
  }, [name])

  // Live preview, debounced so typing doesn't fire a request per key.
  useEffect(() => {
    if (!draft) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/emails/templates/${name}/preview/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
          signal: controller.signal,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setDraftError(data.error || 'Η προεπισκόπηση απέτυχε.')
          return
        }
        setDraftError(null)
        setPreview(data.preview)
      } catch {
        // Aborted by the next keystroke.
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [draft, name])

  const setField = (key: FieldKey, value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  const insertToken = (token: string) => {
    const target = focused.current
    const key: FieldKey = target?.key || 'body'
    const current = draft?.[key] || ''
    const start = target?.el.selectionStart ?? current.length
    const end = target?.el.selectionEnd ?? current.length
    const text = `{${token}}`
    setField(key, current.slice(0, start) + text + current.slice(end))
    requestAnimationFrame(() => {
      if (!target) return
      target.el.focus()
      target.el.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const save = () =>
    run('save', async () => {
      const res = await fetch(`/api/admin/emails/templates/${name}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Η αποθήκευση απέτυχε.')
        return
      }
      setEmail(data.email)
      setDraft(data.email.copy)
      toast.success('Αποθηκεύτηκε. Τα επόμενα emails θα φύγουν με το νέο κείμενο.')
    })

  const reset = () =>
    run('reset', async () => {
      const ok = await confirm({
        title: 'Επαναφορά στο αρχικό κείμενο;',
        message: 'Οι αλλαγές σου σε αυτό το email θα χαθούν.',
        confirmLabel: 'Επαναφορά',
        danger: true,
      })
      if (!ok) return
      const res = await fetch(`/api/admin/emails/templates/${name}/`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Η επαναφορά απέτυχε.')
        return
      }
      setEmail(data.email)
      setDraft(data.email.copy)
      toast.success('Επανήλθε το αρχικό κείμενο.')
    })

  const sendTest = () =>
    run('test', async () => {
      const res = await fetch(`/api/admin/emails/templates/${name}/test/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Η αποστολή απέτυχε.')
        return
      }
      toast.success(`Στάλθηκε δοκιμαστικό στο ${data.to}.`)
    })

  const fieldProps = useCallback(
    (key: FieldKey) => ({
      value: draft?.[key] || '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setField(key, e.target.value),
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        focused.current = { key, el: e.currentTarget }
      },
      onSelect: (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        focused.current = { key, el: e.currentTarget }
      },
    }),
    [draft]
  )

  if (loadError) {
    return (
      <div>
        <p className="text-sm text-tertiary mb-4">{loadError}</p>
        <Link href="/admin/emails/templates/" className="text-sm text-primary underline">
          Πίσω στα emails
        </Link>
      </div>
    )
  }

  if (!email || !draft) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(email.copy)

  return (
    <div className="max-w-6xl">
      <Link href="/admin/emails/templates/" className="text-xs text-on-surface/50 hover:text-on-surface">
        ← Όλα τα emails
      </Link>
      <div className="flex items-start justify-between flex-wrap gap-3 mt-1 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-headline text-on-surface">{email.label}</h1>
          <p className="text-sm text-secondary mt-1">
            <span className="font-bold text-on-surface-variant">Παραλήπτες:</span> {email.audienceLabel}
          </p>
          <p className="text-sm text-secondary">
            <span className="font-bold text-on-surface-variant">Πότε στέλνεται:</span> {email.trigger}
          </p>
          {email.customized && email.updatedAt && (
            <p className="text-xs text-on-surface/50 mt-1">
              Τελευταία αλλαγή {new Date(email.updatedAt).toLocaleString('el-GR')}
              {email.updatedBy ? ` από ${email.updatedBy}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {email.customized && (
            <button
              onClick={reset}
              disabled={isPending('reset')}
              className="px-4 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isPending('reset') ? <Spinner size="sm" /> : <Icon name="restart_alt" size="sm" />}
              Επαναφορά
            </button>
          )}
          <button
            onClick={sendTest}
            disabled={isPending('test') || !!draftError}
            className="px-4 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isPending('test') ? <Spinner size="sm" /> : <Icon name="send" size="sm" />}
            Δοκιμή σε μένα
          </button>
          <button
            onClick={save}
            disabled={isPending('save') || !dirty || !!draftError}
            className="px-5 py-2 rounded-lg bg-gradient-to-br from-primary to-primary-container text-on-primary text-sm font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isPending('save') ? <Spinner size="sm" /> : <Icon name="save" size="sm" />}
            Αποθήκευση
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <div className="space-y-4">
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-4">
            <div>
              <label className={labelClass}>Θέμα</label>
              <input type="text" className={inputClass} {...fieldProps('subject')} />
            </div>
            <div>
              <label className={labelClass}>Τίτλος</label>
              <input type="text" className={inputClass} {...fieldProps('heading')} />
            </div>
            <div>
              <label className={labelClass}>Κείμενο</label>
              <textarea rows={10} className={`${inputClass} leading-relaxed`} {...fieldProps('body')} />
              <p className="text-xs text-on-surface/50 mt-1">
                Κενή γραμμή = νέα παράγραφος. **έντονα**. Μια παράγραφος με πεδίο που δεν έχει τιμή δεν εμφανίζεται.
              </p>
            </div>
            {email.hasCta && (
              <div>
                <label className={labelClass}>Κουμπί</label>
                <input type="text" className={inputClass} {...fieldProps('ctaLabel')} />
                <p className="text-xs text-on-surface/50 mt-1">
                  Ο σύνδεσμος του κουμπιού είναι σταθερός και ανοίγει τη σωστή σελίδα της εφαρμογής.
                </p>
              </div>
            )}
            <div>
              <label className={labelClass}>Σημείωση κάτω από το κουμπί (προαιρετικό)</label>
              <textarea rows={2} className={`${inputClass} leading-relaxed`} {...fieldProps('note')} />
            </div>
          </div>

          {email.variables.length > 0 && (
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-1">
                Πεδία
              </h2>
              <p className="text-xs text-on-surface/50 mb-3">
                Πάτα ένα για να μπει εκεί που είναι ο κέρσορας. Στο email γίνεται η πραγματική τιμή.
              </p>
              <div className="space-y-2">
                {email.variables.map((v) => (
                  <div key={v.token} className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertToken(v.token)}
                      className="px-3 py-1 rounded-full bg-primary-fixed text-on-primary-container text-xs font-bold active:scale-95 transition-all"
                    >
                      {`{${v.token}}`}
                    </button>
                    <span className="text-xs text-secondary">
                      {v.label} — π.χ. «{v.example}»
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-4 space-y-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
            Προεπισκόπηση με παράδειγμα
          </h2>
          {draftError && (
            <div className="rounded-lg border border-error-container bg-error-container/40 px-4 py-3 text-sm text-on-surface">
              {draftError}
            </div>
          )}
          {preview && (
            <>
              <p className="text-sm text-on-surface">
                <span className="font-bold">Θέμα:</span> {preview.subject}
              </p>
              <EmailFrame html={preview.html} title={`Προεπισκόπηση: ${email.label}`} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
