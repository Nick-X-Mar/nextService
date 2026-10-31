'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import SegmentedControl from '@/components/SegmentedControl'
import EmailFrame from './components/EmailFrame'
import type { AdminEmail } from './components/types'

const AUDIENCE_ORDER: AdminEmail['audience'][] = ['client', 'garage', 'account', 'admin']

/**
 * Every email the platform sends, grouped by who receives it. The "all" view
 * renders each one with example values, so the whole set can be read top to
 * bottom (and printed) without opening them one by one.
 */
export default function EmailTemplatesPage() {
  const [view, setView] = useState<'list' | 'all'>('list')
  const [emails, setEmails] = useState<AdminEmail[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // A slow answer for the view just left must not land in the new one.
    let current = true
    setError(null)
    fetch(`/api/admin/emails/templates/${view === 'all' ? '?preview=1' : ''}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        if (current) setEmails(data.emails)
      })
      .catch((err) => {
        if (current) setError(err instanceof Error ? err.message : 'Αποτυχία φόρτωσης')
      })
    return () => {
      current = false
    }
  }, [view])

  const groups = AUDIENCE_ORDER.map((audience) => ({
    audience,
    items: (emails || []).filter((e) => e.audience === audience),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="max-w-5xl">
      <Link href="/admin/emails/" className="text-xs text-on-surface/50 hover:text-on-surface">
        ← Email Analytics
      </Link>
      <div className="flex items-end justify-between flex-wrap gap-3 mt-1 mb-2">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Τα emails της πλατφόρμας</h1>
        <div className="w-full sm:w-72">
          <SegmentedControl
            size="sm"
            value={view}
            onChange={(v) => {
              setEmails(null)
              setView(v as 'list' | 'all')
            }}
            options={[
              { value: 'list', label: 'Λίστα' },
              { value: 'all', label: 'Όλα με προεπισκόπηση' },
            ]}
          />
        </div>
      </div>
      <p className="text-sm text-secondary mb-6 max-w-3xl">
        Όλα τα emails που στέλνει αυτόματα το NextService: πότε φεύγει το καθένα και τι γράφει. Πάτα ένα για να
        αλλάξεις το κείμενό του. Η αλλαγή ισχύει από το επόμενο email που θα σταλεί, χωρίς deploy.
      </p>

      {error && <p className="text-sm text-tertiary mb-4">Σφάλμα: {error}</p>}
      {!emails && !error && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.audience}>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-3">
              {group.items[0].audienceLabel} · {group.items.length}
            </h2>
            <div className={view === 'all' ? 'space-y-6' : 'space-y-2'}>
              {group.items.map((email) =>
                view === 'all' ? (
                  <FullEmail key={email.name} email={email} />
                ) : (
                  <EmailRow key={email.name} email={email} />
                )
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function EmailRow({ email }: { email: AdminEmail }) {
  return (
    <Link
      href={`/admin/emails/templates/${email.name}/`}
      className="block rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 hover:shadow-[0_4px_24px_rgba(27,28,28,0.06)] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-on-surface">{email.label}</span>
            {email.customized && <ChangedBadge />}
          </div>
          <p className="text-sm text-secondary mt-1">{email.trigger}</p>
          <p className="text-xs text-on-surface-variant mt-2 truncate">
            <span className="font-bold">Θέμα:</span> {email.copy.subject}
          </p>
        </div>
        <Icon name="chevron_right" className="text-on-surface/40 shrink-0" />
      </div>
    </Link>
  )
}

function FullEmail({ email }: { email: AdminEmail }) {
  return (
    <article className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 break-inside-avoid">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-on-surface">{email.label}</h3>
            {email.customized && <ChangedBadge />}
          </div>
          <p className="text-sm text-secondary mt-1">
            <span className="font-bold text-on-surface-variant">Πότε στέλνεται:</span> {email.trigger}
          </p>
          <p className="text-sm text-secondary mt-1">
            <span className="font-bold text-on-surface-variant">Θέμα:</span> {email.preview?.subject || email.copy.subject}
          </p>
        </div>
        <Link
          href={`/admin/emails/templates/${email.name}/`}
          className="px-3 py-2 rounded-lg bg-surface-container-high text-xs font-bold text-on-surface hover:bg-surface-container-highest transition-colors shrink-0 flex items-center gap-1"
        >
          <Icon name="edit" size="sm" />
          Αλλαγή
        </Link>
      </div>
      {email.preview && <EmailFrame html={email.preview.html} title={email.label} />}
    </article>
  )
}

function ChangedBadge() {
  return (
    <span className="text-[0.65rem] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
      Αλλαγμένο
    </span>
  )
}
