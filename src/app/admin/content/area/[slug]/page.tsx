'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import type { AreaContent } from '@/types/siteContent'
import { FaqItemsField, StringListField, TextAreaField, TextField, inputClass, labelClass } from '../../components/fields'

export default function AreaContentEditor() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const [area, setArea] = useState<AreaContent | null>(null)
  const [defaults, setDefaults] = useState<AreaContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { run, isPending } = useAsyncTask()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/content/areas/${slug}/`)
      if (res.ok) {
        const data = await res.json()
        setArea(data.area)
        setDefaults(data.defaults)
      } else {
        setError('Η περιοχή δεν βρέθηκε.')
      }
    } catch {
      setError('Αποτυχία φόρτωσης.')
    }
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  const patch = (updates: Partial<AreaContent>) => {
    setArea((prev) => (prev ? { ...prev, ...updates } : prev))
    setSaved(false)
    setError(null)
  }

  const save = () =>
    run(async () => {
      if (!area) return
      setError(null)
      const res = await fetch(`/api/admin/content/areas/${slug}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(area),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Η αποθήκευση απέτυχε.')
        return
      }
      setArea(data.area)
      setSaved(true)
    })

  const reset = () =>
    run('reset', async () => {
      if (!defaults) return
      if (!confirm('Επαναφορά στο αρχικό κείμενο;')) return
      patch({ ...defaults })
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!area) {
    return (
      <div>
        <p className="text-sm text-tertiary mb-4">{error || 'Η περιοχή δεν βρέθηκε.'}</p>
        <Link href="/admin/content/" className="text-sm text-primary underline">
          Πίσω στο περιεχόμενο
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <Link href="/admin/content/" className="text-xs text-on-surface/50 hover:text-on-surface">
            ← Περιεχόμενο
          </Link>
          <h1 className="text-2xl font-bold font-headline text-on-surface mt-1">{area.name}</h1>
          <a
            href={`/location/${slug}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Προβολή /location/{slug}/ ↗
          </a>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={reset}
            disabled={isPending('reset')}
            className="px-4 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
          >
            Επαναφορά
          </button>
          <button
            onClick={save}
            disabled={isPending()}
            className="px-5 py-2 rounded-lg bg-gradient-to-br from-primary to-primary-container text-on-primary text-sm font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isPending() ? <Spinner size="sm" /> : null}
            Αποθήκευση
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-container bg-error-container/40 px-4 py-3 text-sm text-on-surface">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Αποθηκεύτηκε.
        </div>
      )}

      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-4 mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40">
          Βασικά
        </h2>
        <p className="text-xs text-on-surface/40">
          Το slug <code className="text-on-surface/60">{slug}</code> δεν αλλάζει — έρχεται από
          το παλιό site και κρατάει τη θέση της σελίδας στη Google.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Όνομα" value={area.name} onChange={(name) => patch({ name })} />
          <TextField
            label="Γενική"
            value={area.nameGenitive}
            onChange={(nameGenitive) => patch({ nameGenitive })}
            hint="π.χ. «Πειραιά» — χρησιμοποιείται σε τίτλους"
          />
          <TextField label="Νομός" value={area.region} onChange={(region) => patch({ region })} />
          <div>
            <label className={labelClass}>Κάλυψη</label>
            <select
              value={area.coverage}
              onChange={(e) => patch({ coverage: e.target.value as 'active' | 'expanding' })}
              className={inputClass}
            >
              <option value="active">Ενεργό — έχουμε συνεργεία</option>
              <option value="expanding">Σύντομα — χτίζουμε δίκτυο</option>
            </select>
          </div>
        </div>
        <StringListField
          label="Ενεργά σημεία"
          items={area.activeIn}
          onChange={(activeIn) => patch({ activeIn })}
          placeholder="π.χ. Κερατσίνι"
        />
      </div>

      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-4 mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40">SEO</h2>
        <TextField label="Τίτλος" value={area.title} onChange={(title) => patch({ title })} />
        <TextAreaField
          label="Περιγραφή"
          value={area.description}
          onChange={(description) => patch({ description })}
          rows={3}
          hint="Φαίνεται και στην κάρτα της περιοχής στη σελίδα «Περιοχές»."
        />
      </div>

      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-4 mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40">
          Κείμενα
        </h2>
        <TextAreaField label="Εισαγωγή" value={area.intro} onChange={(intro) => patch({ intro })} rows={4} />
        <TextAreaField label="Αναλυτικά" value={area.detail} onChange={(detail) => patch({ detail })} rows={5} />
        <StringListField
          label="Γειτονιές"
          items={area.neighbourhoods}
          onChange={(neighbourhoods) => patch({ neighbourhoods })}
        />
        <StringListField
          label="Συνήθεις εργασίες"
          items={area.commonServices}
          onChange={(commonServices) => patch({ commonServices })}
        />
      </div>

      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40">
          Συχνές ερωτήσεις
        </h2>
        <FaqItemsField items={area.faqs} onChange={(faqs) => patch({ faqs })} />
      </div>
    </div>
  )
}
