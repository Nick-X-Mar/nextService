'use client'

import { useMemo, useState } from 'react'
import { Modal, Spinner, StarRating } from '@/components'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import {
  CLIENT_REVIEW_TAGS,
  LOWER_AMOUNT_REASONS,
  NOT_DONE_REASONS,
  splitVat,
} from '@/types/reviews'
import { DECLARABLE_VAT_RATES } from '@/lib/commission-basis'

/**
 * The rate the declared amount is split at. Sent explicitly because the server
 * accepts only the rates this form offers — see DECLARABLE_VAT_RATES.
 */
const VAT_RATE = DECLARABLE_VAT_RATES[0]

/**
 * What the garage fills in once an appointment has passed.
 *
 * Three things in one step — did it happen, what did you charge, how was the
 * client — because a garage that has just finished a job will fill in one form
 * and ignore a second one. Only the first two are required; the rating is
 * optional and clearly marked as such.
 *
 * - It happened: was the amount the quote's? One tap if so. If not, the final
 *   amount net of VAT, and a reason when it is lower than the quote.
 * - It did not: why, from a list (only "δεν ήρθε" counts as a no-show).
 *
 * The VAT split is shown live, because the net is the number commission is
 * calculated on and it should never be a surprise later.
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
  const hasQuote = typeof quotedPrice === 'number' && quotedPrice > 0
  const [happened, setHappened] = useState(true)
  // null until the garage answers "same as the quote?"; no quote, no question.
  const [sameAsQuote, setSameAsQuote] = useState<boolean | null>(hasQuote ? null : false)
  const [amount, setAmount] = useState('')
  const [notDoneCode, setNotDoneCode] = useState('')
  const [lowerCode, setLowerCode] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const { success, error: showError } = useToast()
  const { run, isPending } = useAsyncTask()
  const submitting = isPending()
  // Closing mid-request would let `onCompleted` land on an unmounted modal
  // and leave the garage unsure whether the job was recorded.
  const close = () => {
    if (!submitting) onClose()
  }

  // Garages quote net of VAT, and the final amount is asked for net too.
  const parsed = sameAsQuote && hasQuote ? quotedPrice : Number(amount.replace(',', '.'))
  const breakdown = useMemo(() => {
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return splitVat(parsed, 'net', VAT_RATE)
  }, [parsed])
  const isLower = happened && hasQuote && !sameAsQuote && !!breakdown && breakdown.net < quotedPrice - 0.005
  const reasonCode = happened ? (isLower ? lowerCode : '') : notDoneCode
  const notDoneDef = NOT_DONE_REASONS.find((r) => r.code === notDoneCode)

  const submit = () =>
    run(async () => {
      if (happened && sameAsQuote === null) {
        showError('Πες μας αν το ποσό ήταν αυτό της προσφοράς.')
        return
      }
      if (happened && (!breakdown || breakdown.gross <= 0)) {
        showError('Συμπλήρωσε το τελικό ποσό χωρίς ΦΠΑ.')
        return
      }
      if ((!happened || isLower) && !reasonCode) {
        showError(happened ? 'Το ποσό είναι μικρότερο από την προσφορά. Διάλεξε τον λόγο.' : 'Διάλεξε τον λόγο που δεν έγινε.')
        return
      }
      if (reasonCode === 'other' && !reasonText.trim()) {
        showError('Γράψε τον λόγο.')
        return
      }

      const res = await fetch(`/api/requests/${requestId}/complete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: happened ? 'completed' : notDoneDef?.outcome,
          ...(happened ? { amount: parsed, vatIncluded: false, vatRate: VAT_RATE } : {}),
          ...(reasonCode ? { reason: { code: reasonCode, text: reasonCode === 'other' ? reasonText : undefined } } : {}),
          notes,
          ...(rating > 0 ? { rating, comment, tags } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showError(data.error || 'Δεν καταχωρήθηκε. Δοκίμασε ξανά.')
        // 409: the job was closed or cancelled elsewhere, so this form can no
        // longer succeed — refresh the list instead of leaving it open.
        if (res.status === 409) {
          onCompleted()
          onClose()
        }
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

  const choice = (selected: boolean) =>
    `flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold transition-colors active:scale-95 ${
      selected
        ? 'border-primary bg-primary/5 text-primary'
        : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface'
    }`
  const label = 'block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-2'
  const field = 'w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-sm text-on-surface'

  return (
    <Modal isOpen={isOpen} onClose={close} title="Ολοκλήρωση εργασίας" size="lg">
      <div className="space-y-6">
        {vehicleLabel && (
          <p className="text-sm text-secondary">
            <Icon name="directions_car" size="sm" className="align-middle mr-1" />
            {vehicleLabel}
          </p>
        )}

        <div>
          <p className={label}>Έγινε το ραντεβού;</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setHappened(true)} disabled={submitting} className={choice(happened)}>
              <Icon name="check_circle" size="sm" />
              Ναι, έγινε
            </button>
            <button type="button" onClick={() => setHappened(false)} disabled={submitting} className={choice(!happened)}>
              <Icon name="do_not_disturb_on" size="sm" />
              Όχι
            </button>
          </div>
        </div>

        {!happened && (
          <div className="space-y-3">
            <div>
              <label htmlFor="not-done-reason" className={label}>
                Γιατί δεν έγινε; <span className="text-tertiary">*</span>
              </label>
              <select
                id="not-done-reason"
                value={notDoneCode}
                onChange={(e) => setNotDoneCode(e.target.value)}
                disabled={submitting}
                className={field}
              >
                <option value="">Διάλεξε λόγο</option>
                {NOT_DONE_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </div>
            {/* Said up front: the commission is waived only after a check with the client. */}
            <p className="flex items-start gap-2 rounded-xl bg-surface-container-low p-3 text-xs text-on-surface-variant">
              <Icon name="info" size="sm" className="text-primary shrink-0" />
              Θα επικοινωνήσουμε με τον πελάτη για επιβεβαίωση. Αν η εργασία έγινε τελικά, χρεώνεται κανονικά με την
              τιμή της προσφοράς.
            </p>
          </div>
        )}

        {happened && hasQuote && (
          <div>
            <p className={label}>Το ποσό που εισέπραξες είναι αυτό της προσφοράς;</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSameAsQuote(true)}
                disabled={submitting}
                className={choice(sameAsQuote === true)}
              >
                Ναι, {quotedPrice.toFixed(2)}€ + ΦΠΑ
              </button>
              <button
                type="button"
                onClick={() => setSameAsQuote(false)}
                disabled={submitting}
                className={choice(sameAsQuote === false)}
              >
                Όχι, άλλο ποσό
              </button>
            </div>
          </div>
        )}

        {happened && sameAsQuote === false && (
          <div className="space-y-3">
            <div>
              <label htmlFor="final-amount" className={label}>
                Τελικό ποσό χωρίς ΦΠΑ <span className="text-tertiary">*</span>
              </label>
              <div className="relative">
                <input
                  id="final-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 pr-8 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-base font-medium text-on-surface"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">€</span>
              </div>
              {hasQuote && (
                <p className="text-xs text-on-surface-variant mt-1">
                  Είχες δώσει προσφορά {quotedPrice.toFixed(2)}€ + ΦΠΑ
                </p>
              )}
            </div>

            {isLower && (
              <div>
                <label htmlFor="lower-reason" className={label}>
                  Γιατί είναι μικρότερο από την προσφορά; <span className="text-tertiary">*</span>
                </label>
                <select
                  id="lower-reason"
                  value={lowerCode}
                  onChange={(e) => setLowerCode(e.target.value)}
                  disabled={submitting}
                  className={field}
                >
                  <option value="">Διάλεξε λόγο</option>
                  {LOWER_AMOUNT_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {reasonCode === 'other' && (
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Γράψε τον λόγο"
            aria-label="Άλλος λόγος"
            className={field}
          />
        )}

        {happened && breakdown && (
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
              <span className="font-bold text-on-surface">Σύνολο με ΦΠΑ</span>
              <span className="font-bold text-on-surface">{breakdown.gross.toFixed(2)}€</span>
            </div>
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
            onClick={close}
            disabled={submitting}
            className="flex-1 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-2.5 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container active:scale-95 disabled:opacity-50"
          >
            Άκυρο
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-gradient-to-br from-primary to-primary-container px-4 py-2.5 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Spinner size="sm" /> : <Icon name="task_alt" size="sm" />}
            Καταχώρηση
          </button>
        </div>
      </div>
    </Modal>
  )
}
