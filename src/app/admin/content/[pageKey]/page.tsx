'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Spinner from '@/components/Spinner'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import type { ContentBlock, ContentBlockType, SitePage } from '@/types/siteContent'
import BlockCard, { blockLabel } from '../components/BlockCard'
import { TextAreaField, TextField } from '../components/fields'

const ADDABLE: ContentBlockType[] = ['heading', 'paragraph', 'list', 'faq', 'cards', 'callout', 'cta']

/**
 * Ids are what the server de-duplicates on and what React keys the list by, so
 * a newly added block needs one that cannot collide with a hand-written id
 * from the shipped defaults.
 */
function newBlock(type: ContentBlockType): ContentBlock {
  const id = `${type}-${Math.random().toString(36).slice(2, 9)}`
  switch (type) {
    case 'heading': return { id, type, text: '' }
    case 'paragraph': return { id, type, text: '' }
    case 'list': return { id, type, items: [] }
    case 'faq': return { id, type, items: [] }
    case 'cards': return { id, type, items: [] }
    case 'callout': return { id, type, tone: 'info', text: '' }
    case 'cta': return { id, type, label: '', href: '/', variant: 'primary' }
    default: return { id, type: 'paragraph', text: '' }
  }
}

export default function ContentPageEditor() {
  const params = useParams<{ pageKey: string }>()
  const pageKey = params.pageKey

  const [page, setPage] = useState<SitePage | null>(null)
  const [meta, setMeta] = useState<{ label: string; path: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { run, isPending } = useAsyncTask()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/content/pages/${pageKey}/`)
      if (res.ok) {
        const data = await res.json()
        setPage(data.page)
        setMeta(data.meta)
      } else {
        setError('Η σελίδα δεν βρέθηκε.')
      }
    } catch {
      setError('Αποτυχία φόρτωσης.')
    }
    setLoading(false)
  }, [pageKey])

  useEffect(() => { load() }, [load])

  const patch = (updates: Partial<SitePage>) => {
    setPage((prev) => (prev ? { ...prev, ...updates } : prev))
    setSaved(false)
    setError(null)
  }

  const setBlock = (index: number, block: ContentBlock) => {
    if (!page) return
    const blocks = [...page.blocks]
    blocks[index] = block
    patch({ blocks })
  }

  const moveBlock = (from: number, to: number) => {
    if (!page || to < 0 || to >= page.blocks.length) return
    const blocks = [...page.blocks]
    const [moved] = blocks.splice(from, 1)
    blocks.splice(to, 0, moved)
    patch({ blocks })
  }

  const save = () =>
    run(async () => {
      if (!page) return
      setError(null)
      const res = await fetch(`/api/admin/content/pages/${pageKey}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(page),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Η αποθήκευση απέτυχε.')
        return
      }
      setPage(data.page)
      setSaved(true)
    })

  const reset = () =>
    run('reset', async () => {
      if (!confirm('Επαναφορά στο αρχικό κείμενο; Οι αλλαγές σου θα χαθούν.')) return
      const res = await fetch(`/api/admin/content/pages/${pageKey}/`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Η επαναφορά απέτυχε.')
        return
      }
      setPage(data.page)
      setSaved(true)
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!page) {
    return (
      <div>
        <p className="text-sm text-tertiary mb-4">{error || 'Η σελίδα δεν βρέθηκε.'}</p>
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
          <h1 className="text-2xl font-bold font-headline text-on-surface mt-1">
            {meta?.label || pageKey}
          </h1>
          {meta?.path && (
            <a
              href={meta.path}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Προβολή {meta.path} ↗
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={reset}
            disabled={isPending('reset')}
            className="px-4 py-2 rounded-lg bg-surface-container-high text-sm text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isPending('reset') ? <Spinner size="sm" /> : null}
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
          Αποθηκεύτηκε. Η σελίδα ενημερώθηκε.
        </div>
      )}

      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-4 mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40">
          SEO
        </h2>
        <TextField
          label="Τίτλος"
          value={page.meta.title}
          onChange={(title) => patch({ meta: { ...page.meta, title } })}
        />
        <TextAreaField
          label="Περιγραφή"
          value={page.meta.description}
          onChange={(description) => patch({ meta: { ...page.meta, description } })}
          rows={3}
          hint="Εμφανίζεται στα αποτελέσματα αναζήτησης."
        />
      </div>

      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 space-y-4 mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40">
          Επικεφαλίδα
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Τίτλος"
            value={page.hero.title}
            onChange={(title) => patch({ hero: { ...page.hero, title } })}
          />
          <TextField
            label="Τονισμένο τμήμα"
            value={page.hero.titleAccent || ''}
            onChange={(titleAccent) => patch({ hero: { ...page.hero, titleAccent } })}
            hint="Εμφανίζεται στο χρώμα της μάρκας."
          />
        </div>
        <TextAreaField
          label="Εισαγωγή"
          value={page.hero.lead || ''}
          onChange={(lead) => patch({ hero: { ...page.hero, lead } })}
          rows={3}
          hint="**έντονα**, *πλάγια*, [κείμενο](https://…)"
        />
      </div>

      <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40 mb-3">
        Περιεχόμενο
      </h2>
      <div className="space-y-3 mb-4">
        {page.blocks.map((block, index) => (
          <BlockCard
            key={block.id}
            block={block}
            index={index}
            total={page.blocks.length}
            onChange={(next) => setBlock(index, next)}
            onMove={moveBlock}
            onRemove={() => patch({ blocks: page.blocks.filter((_, i) => i !== index) })}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {ADDABLE.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => patch({ blocks: [...page.blocks, newBlock(type)] })}
            className="px-3 py-2 rounded-lg bg-surface-container-high text-xs font-bold text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            + {blockLabel(type)}
          </button>
        ))}
      </div>
    </div>
  )
}
