'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface PageRow {
  pageKey: string
  label: string
  path: string
  edited: boolean
  updatedAt: string | null
  updatedBy: string | null
}

interface AreaRow {
  slug: string
  name: string
  region: string
  coverage: 'active' | 'expanding'
  edited: boolean
  updatedAt: string | null
  updatedBy: string | null
}

function When({ at, by }: { at: string | null; by: string | null }) {
  if (!at) {
    return <span className="text-xs text-on-surface/40">Αρχικό κείμενο</span>
  }
  const date = new Date(at)
  return (
    <span className="text-xs text-on-surface/50">
      {isNaN(date.getTime()) ? '—' : date.toLocaleString('el-GR')}
      {by ? ` · ${by}` : ''}
    </span>
  )
}

export default function AdminContentPage() {
  const [pages, setPages] = useState<PageRow[]>([])
  const [areas, setAreas] = useState<AreaRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/content/')
      if (res.ok) {
        const data = await res.json()
        setPages(data.pages || [])
        setAreas(data.areas || [])
      }
    } catch { /* empty */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Περιεχόμενο</h1>
        <p className="text-sm text-on-surface/60 mt-1">
          Τα κείμενα των δημόσιων σελίδων. Οι αλλαγές εμφανίζονται αμέσως — δεν χρειάζεται deploy.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40 mb-3">
          Σελίδες
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {pages.map((page) => (
            <Link
              key={page.pageKey}
              href={`/admin/content/${page.pageKey}/`}
              className="block rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 hover:bg-surface-container transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-base font-bold text-on-surface">{page.label}</span>
                {page.edited && (
                  <span className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-green-700 bg-green-100 px-2 py-1 rounded-sm">
                    Τροποποιημένο
                  </span>
                )}
              </div>
              <div className="text-xs text-on-surface/40 mb-2">{page.path}</div>
              <When at={page.updatedAt} by={page.updatedBy} />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface/40 mb-3">
          Περιοχές
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {areas.map((area) => (
            <Link
              key={area.slug}
              href={`/admin/content/area/${area.slug}/`}
              className="block rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 hover:bg-surface-container transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-base font-bold text-on-surface">{area.name}</span>
                <span
                  className={
                    area.coverage === 'active'
                      ? 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-green-700 bg-green-100 px-2 py-1 rounded-sm'
                      : 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-amber-800 bg-amber-100 px-2 py-1 rounded-sm'
                  }
                >
                  {area.coverage === 'active' ? 'Ενεργό' : 'Σύντομα'}
                </span>
              </div>
              <div className="text-xs text-on-surface/40 mb-2">/location/{area.slug}/</div>
              <When at={area.updatedAt} by={area.updatedBy} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
