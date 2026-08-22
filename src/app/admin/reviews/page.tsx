'use client'

import { useCallback, useEffect, useState } from 'react'
import Spinner from '@/components/Spinner'
import StarRating from '@/components/StarRating'
import { useAsyncTask } from '@/hooks/useAsyncTask'

interface AdminReview {
  reviewId: string
  requestId: string
  garageId: string
  clientId: string
  garageName: string
  clientName: string
  direction: 'client_to_garage' | 'garage_to_client'
  rating: number
  comment?: string
  tags?: string[]
  status: 'published' | 'hidden'
  createdAt: string
  moderatedBy?: string
  moderationReason?: string
}

const FILTERS = [
  { value: '', label: 'Όλες' },
  { value: 'published', label: 'Δημοσιευμένες' },
  { value: 'hidden', label: 'Κρυμμένες' },
] as const

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [status, setStatus] = useState('')
  const [direction, setDirection] = useState('')
  const [loading, setLoading] = useState(true)
  const { run, isPending } = useAsyncTask()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      if (status) query.set('status', status)
      if (direction) query.set('direction', direction)
      const res = await fetch(`/api/admin/reviews/?${query.toString()}`)
      if (res.ok) setReviews((await res.json()).reviews || [])
    } catch { /* empty */ }
    setLoading(false)
  }, [status, direction])

  useEffect(() => { load() }, [load])

  const moderate = (review: AdminReview) =>
    run(review.reviewId, async () => {
      const next = review.status === 'hidden' ? 'published' : 'hidden'
      if (next === 'hidden' && !confirm('Απόκρυψη; Θα αφαιρεθεί και από τον μέσο όρο.')) return
      const res = await fetch(`/api/admin/reviews/${encodeURIComponent(review.reviewId)}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) await load()
    })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-headline text-on-surface">Αξιολογήσεις</h1>
        <p className="text-sm text-on-surface/60 mt-1">
          Απόκρυψη αφαιρεί την αξιολόγηση από τη σελίδα και από τον μέσο όρο. Η εγγραφή
          διατηρείται.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              status === f.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px bg-outline-variant/30 mx-1" />
        {[
          { value: '', label: 'Και οι δύο' },
          { value: 'client_to_garage', label: 'Πελάτης → Συνεργείο' },
          { value: 'garage_to_client', label: 'Συνεργείο → Πελάτης' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setDirection(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              direction === f.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-on-surface/50">Καμία αξιολόγηση.</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div
              key={review.reviewId}
              className={`rounded-xl border p-4 ${
                review.status === 'hidden'
                  ? 'border-outline-variant/20 bg-surface-container opacity-70'
                  : 'border-outline-variant/20 bg-surface-container-lowest'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-bold text-on-surface">
                    {review.direction === 'client_to_garage'
                      ? `${review.clientName} → ${review.garageName}`
                      : `${review.garageName} → ${review.clientName}`}
                  </p>
                  <p className="text-xs text-on-surface/40">
                    {new Date(review.createdAt).toLocaleString('el-GR')} · {review.requestId}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StarRating value={review.rating} size="sm" />
                  <button
                    onClick={() => moderate(review)}
                    disabled={isPending(review.reviewId)}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-high text-xs font-bold text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isPending(review.reviewId) && <Spinner size="sm" />}
                    {review.status === 'hidden' ? 'Επαναφορά' : 'Απόκρυψη'}
                  </button>
                </div>
              </div>

              {review.tags && review.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {review.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-bold text-on-surface/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {review.comment && (
                <p className="text-sm text-on-surface/80 leading-relaxed">{review.comment}</p>
              )}

              {review.status === 'hidden' && review.moderatedBy && (
                <p className="text-xs text-tertiary mt-2">
                  Κρύφτηκε από {review.moderatedBy}
                  {review.moderationReason ? ` — ${review.moderationReason}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
