'use client'

import { useMemo, useState } from 'react'
import { Modal, Spinner, StarRating } from '@/components'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import {
  CLIENT_REVIEW_TAGS,
  DEFAULT_VAT_RATE,
  splitVat,
  type CompletionOutcome,
} from '@/types/reviews'

/**
 * What the garage fills in once an appointment has passed.
 *
 * Three things in one step — did it happen, what did you charge, how was the
 * client — because a garage that has just finished a job will fill in one form
 * and ignore a second one. Only the first two are required; the rating is
 * optional and clearly marked as such.
 *
 * The amount is entered as the garage thinks of it: the figure on the receipt,
 * VAT included. The net is derived and shown live, because that is the number
 * commission is calculated on and it should never be a surprise later.
 */
export default function CompletionModal({
  isOpen,
  onClose,
  requestId,
  vehicleLabel,
  quotedPrice,
  onCompleted,
}: {
  isOpen: boolean
  onClose: () => void
  requestId: string
  vehicleLabel?: string
  quotedPrice?: number
  onCompleted: () => void
}) {
  const [outcome, setOutcome] = useState<CompletionOutcome>('completed')
  const [amount, setAmount] = useState(quotedPrice ? String(quotedPrice) : '')
  const [vatIncluded, setVatIncluded] = useState(true)
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const { success, error: showError } = useToast()
  const { run, isPending } = useAsyncTask()

  const parsed = Number(amount.replace(',', '.'))
  const breakdown = useMemo(() => {
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return splitVat(parsed, vatIncluded ? 'gross' : 'net', DEFAULT_VAT_RATE)
  }, [parsed, vatIncluded])

  const submit = () =>
    run(async () => {
      if (outcome === 'completed' && (!breakdown || breakdown.gross <= 0)) {
        showError('Συμπλήρωσε το ποσό που χρέωσες.')
        return
      }

      const res = await fetch(`/api/requests/${requestId}/complete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          ...(outcome === 'completed' ? { amount: parsed, vatIncluded } : {}),
          notes,
          ...(rating > 0 ? { rating, comment, tags } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showError(data.error || 'Δεν καταχωρήθηκε. Δοκίμασε ξανά.')
        return
      }
      if (data.reviewError) {
        showError(data.reviewError)
      }
      success('Καταχωρήθηκε. Ευχαριστούμε!')
      onCompleted()
      onClose()
    })

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))

  const outcomes: { value: CompletionOutcome; label: string; icon: string }[] = [
    { value: 'completed', label: 'Ναι, έγινε', icon: 'check_circle' },
    { value: 'not_done', label: 'Ήρθε, δεν έγινε', icon: 'do_not_disturb_on' },
    { value: 'no_show', label: 'Δεν ήρθε', icon: 'person_off' },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ολοκλήρωση εργασίας" size="lg">
      <div className="space-y-6">
        {vehicleLabel && (
          <p className="text-sm text-secondary">
            <Icon name="directions_car" size="sm" className="align-middle mr-1" />
            {vehicleLabel}
          </p>
        )}

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-2">
            Έγινε η επισκευή;
          </p>
          <div className="grid grid-cols-3 gap-2">
            {outcomes.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setOutcome(option.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-bold transition-colors active:scale-95 ${
                  outcome === option.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface'
                }`}
              >
                <Icon name={option.icon} size="md" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {outcome === 'completed' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-1">
                Ποσό που χρέωσες <span className="text-tertiary">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 pr-8 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-base font-medium text-on-surface"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                    €
                  </span>
                </div>
              </div>
              {typeof quotedPrice === 'number' && quotedPrice > 0 && (
                <p className="text-xs text-on-surface-variant mt-1">
                  Είχες δώσει προσφορά {quotedPrice.toFixed(2)}€
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {[
                { value: true, label: 'Με ΦΠΑ' },
                { value: false, label: 'Χωρίς ΦΠΑ' },
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => setVatIncluded(option.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-colors active:scale-95 ${
                    vatIncluded === option.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {breakdown && (
              // Shown live so the split is never a surprise on the commission
              // report later — that is calculated on the net figure.
              <div className="rounded-xl bg-surface-container-low p-3 text-sm">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Καθαρή αξία</span>
                  <span className="font-medium text-on-surface">{breakdown.net.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>ΦΠΑ {breakdown.vatRate}%</span>
                  <span className="font-medium text-on-surface">{breakdown.vat.toFixed(2)}€</span>
                </div>
                <div className="mt-1 pt-1 border-t border-outline-variant/20 flex justify-between">
                  <span className="font-bold text-on-surface">Σύνολο</span>
                  <span className="font-bold text-on-surface">{breakdown.gross.toFixed(2)}€</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-1">
            Σημειώσεις (προαιρετικά)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Τι έγινε στην εργασία"
            className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-sm text-on-surface"
          />
        </div>

        <div className="border-t border-outline-variant/20 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-2">
            Αξιολόγηση πελάτη (προαιρετικά)
          </p>
          <StarRating value={rating} onChange={setRating} label="Αξιολόγηση πελάτη" />

          {rating > 0 && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {CLIENT_REVIEW_TAGS.map((tag) => (
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
                rows={2}
                placeholder="Σχόλιο για τον πελάτη"
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-sm text-on-surface"
              />
              <p className="text-xs text-on-surface-variant">
                Ο πελάτης θα δει την αξιολόγησή σου μόνο αφού γράψει και τη δική του.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-2.5 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container"
          >
            Άκυρο
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending()}
            className="flex-1 rounded-lg bg-gradient-to-br from-primary to-primary-container px-4 py-2.5 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending() ? <Spinner size="sm" /> : <Icon name="task_alt" size="sm" />}
            Καταχώρηση
          </button>
        </div>
      </div>
    </Modal>
  )
}
