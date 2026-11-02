'use client'

import { useEffect, useState } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'

interface PagerProps {
  page: number
  pageSize: number
  total: number
  /** A page is being fetched: the button that asked for it spins. */
  loading?: boolean
  onPage: (page: number) => void
}

const button = 'inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-surface-container-high text-on-surface hover:bg-surface-container-highest disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

export default function Pager({ page, pageSize, total, loading = false, onPage }: PagerProps) {
  const [asked, setAsked] = useState<'prev' | 'next' | null>(null)
  useEffect(() => { if (!loading) setAsked(null) }, [loading])

  if (total === 0) return null
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mt-3" data-testid="pager">
      <p className="text-sm text-on-surface/60">{first}–{last} of {total}</p>
      {lastPage > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={button}
            disabled={page <= 1 || loading}
            onClick={() => { setAsked('prev'); onPage(page - 1) }}
          >
            {loading && asked === 'prev' ? <Spinner size="sm" /> : <Icon name="chevron_left" size="sm" />}
            Previous
          </button>
          <span className="text-sm text-on-surface/60 whitespace-nowrap">Page {page} of {lastPage}</span>
          <button
            type="button"
            className={button}
            disabled={page >= lastPage || loading}
            onClick={() => { setAsked('next'); onPage(page + 1) }}
          >
            Next
            {loading && asked === 'next' ? <Spinner size="sm" /> : <Icon name="chevron_right" size="sm" />}
          </button>
        </div>
      )}
    </div>
  )
}
