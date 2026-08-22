'use client'

import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import StarRating from '@/components/StarRating'
import { useToast } from '@/hooks/useToast'
import { useAsyncTask } from '@/hooks/useAsyncTask'

interface ReviewView {
  rating: number
  comment: string
  tags: string[]
  createdAt: string
}

interface ReviewState {
  canReview: boolean
  mine: ReviewView | null
  theirsExists: boolean
  theirs: ReviewView | null
  tags: string[]
}

/**
 * The review panel on a completed job, used by both sides.
 *
 * It has three states, and which one is showing is the whole point:
 *   - you still owe a review        → the form
 *   - you wrote one, they have not  → yours, plus "waiting on them"
 *   - both wrote                    → both, side by side
 *
 * Reviews stay hidden until both parties have written, so nobody can read the
 * other's rating and answer it. The panel says so explicitly rather than
 * silently showing an empty space, which reads like a bug.
 */
export default function ReviewPanel({
  requestId,
  counterpartyLabel,
  counterpartyName,
}: {
  requestId: string
  /** "το συνεργείο" or "τον πελάτη" — used in the prompts. */
  counterpartyLabel: string
  counterpartyName?: string
}) {
  const [state, setState] = useState<ReviewState | null>(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const { success, error: showError } = useToast()
  const { run, isPending } = useAsyncTask()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${requestId}/review/`, { cache: 'no-store' })
      if (res.ok) setState(await res.json())
    } catch {
      /* a missing panel is better than a broken page */
    }
    setLoading(false)
  }, [requestId])

  useEffect(() => { load() }, [load])

  const submit = () =>
    run(async () => {
      if (rating < 1) {
        showError('Διάλεξε βαθμολογία από 1 έως 5 αστέρια.')
        return
      }
      const res = await fetch(`/api/requests/${requestId}/review/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment, tags }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showError(data.error || 'Η αξιολόγηση δεν καταχωρήθηκε.')
        return
      }
      success('Ευχαριστούμε για την αξιολόγηση!')
      await load()
    })

  if (loading) {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 flex justify-center">
        <Spinner size="md" />
      </div>
    )
  }

  if (!state) return null

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))

  const Written = ({ review, who }: { review: ReviewView; who: string }) => (
    <div className="rounded-lg bg-surface-container-low p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-1">
        {who}
      </p>
      <StarRating value={review.rating} size="sm" />
      {review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {review.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-bold text-on-surface-variant"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {review.comment && (
        <p className="text-sm text-secondary leading-relaxed mt-2">{review.comment}</p>
      )}
    </div>
  )

  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="star" size="md" className="text-primary" />
        <h4 className="text-lg font-bold text-on-surface">Αξιολόγηση</h4>
      </div>

      {state.canReview && !state.mine && (
        <div className="space-y-4">
          <p className="text-sm text-secondary leading-relaxed">
            Πώς πήγε; Αξιολόγησε {counterpartyLabel}
            {counterpartyName ? ` (${counterpartyName})` : ''}. Η αξιολόγησή σου εμφανίζεται
            μόνο αφού γράψουν και οι δύο πλευρές.
          </p>

          <StarRating value={rating} onChange={setRating} size="lg" label="Βαθμολογία" />

          {rating > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                {state.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors active:scale-95 ${
                      tags.includes(tag)
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Γράψε λίγα λόγια (προαιρετικά)"
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-sm text-on-surface"
              />

              <button
                type="button"
                onClick={submit}
                disabled={isPending()}
                className="w-full rounded-lg bg-gradient-to-br from-primary to-primary-container px-4 py-3 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isPending() ? <Spinner size="sm" /> : <Icon name="send" size="sm" />}
                Υποβολή
              </button>
            </>
          )}
        </div>
      )}

      {state.mine && (
        <div className="space-y-3">
          <Written review={state.mine} who="Η αξιολόγησή σου" />

          {state.theirs ? (
            <Written review={state.theirs} who={`Η αξιολόγηση από ${counterpartyLabel}`} />
          ) : state.theirsExists ? (
            <p className="text-sm text-on-surface-variant">
              Έχει γραφτεί και αξιολόγηση για σένα — θα εμφανιστεί σύντομα.
            </p>
          ) : (
            <p className="text-sm text-on-surface-variant">
              Περιμένουμε ακόμη την αξιολόγηση από {counterpartyLabel}.
            </p>
          )}
        </div>
      )}

      {!state.canReview && !state.mine && (
        <p className="text-sm text-on-surface-variant">
          {state.theirsExists
            ? 'Η προθεσμία αξιολόγησης έχει περάσει.'
            : 'Η αξιολόγηση ανοίγει μόλις το συνεργείο δηλώσει ότι ολοκληρώθηκε η εργασία.'}
        </p>
      )}
    </div>
  )
}
