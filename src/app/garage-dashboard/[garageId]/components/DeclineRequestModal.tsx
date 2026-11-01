'use client'

import { useState } from 'react'
import { Modal, Spinner } from '@/components'
import Icon from '@/components/ui/Icon'
import { useToast } from '@/hooks/useToast'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { DECLINE_REASONS, type DeclineReason } from '@/types/declines'

/**
 * "Δεν μπορώ να το αναλάβω": the garage picks why, and the request moves from
 * its feed to Προσφορές → Απορριφθείσες. The client is not told.
 */
export default function DeclineRequestModal({
  requestId,
  vehicleLabel,
  onClose,
  onDeclined,
}: {
  /** The request being declined; the modal is open while this is set. */
  requestId: string | null
  vehicleLabel?: string
  onClose: () => void
  onDeclined: (requestId: string) => void
}) {
  const [reason, setReason] = useState<DeclineReason | null>(null)
  const [reasonText, setReasonText] = useState('')
  const { success, error: showError } = useToast()
  const { run, isPending } = useAsyncTask()
  const submitting = isPending()

  const close = () => {
    if (submitting) return
    setReason(null)
    setReasonText('')
    onClose()
  }

  const submit = () =>
    run(async () => {
      if (!requestId) return
      if (!reason) {
        showError('Διάλεξε τον λόγο.')
        return
      }
      if (reason === 'other' && !reasonText.trim()) {
        showError('Γράψε τον λόγο.')
        return
      }
      const res = await fetch('/api/garage/declines/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reason, reasonText: reason === 'other' ? reasonText : undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showError(data.error || 'Δεν καταχωρήθηκε. Δοκίμασε ξανά.')
        // 409: the request closed or was already quoted — it no longer belongs in the feed either way.
        if (res.status === 409) onDeclined(requestId)
        close()
        return
      }
      success('Το αίτημα μεταφέρθηκε στις Απορριφθείσες.')
      onDeclined(requestId)
      setReason(null)
      setReasonText('')
      onClose()
    })

  return (
    <Modal isOpen={!!requestId} onClose={close} title="Δεν μπορώ να το αναλάβω" size="md">
      <div className="space-y-4">
        {vehicleLabel && (
          <p className="text-sm text-secondary">
            <Icon name="directions_car" size="sm" className="align-middle mr-1" />
            {vehicleLabel}
          </p>
        )}
        <p className="text-sm text-on-surface-variant">
          Το αίτημα θα φύγει από τα νέα αιτήματα και θα το βρεις στις Προσφορές → Απορριφθείσες. Ο πελάτης δεν
          ενημερώνεται.
        </p>
        <fieldset>
          <legend className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-2">
            Λόγος <span className="text-tertiary">*</span>
          </legend>
          <div className="space-y-2">
            {DECLINE_REASONS.map((option) => (
              <label
                key={option.code}
                className={`flex items-center gap-3 rounded-xl border p-3 text-sm cursor-pointer transition-colors ${
                  reason === option.code
                    ? 'border-primary bg-primary/5 text-primary font-bold'
                    : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface'
                }`}
              >
                <input
                  type="radio"
                  name="decline-reason"
                  value={option.code}
                  checked={reason === option.code}
                  onChange={() => setReason(option.code)}
                  className="accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        {reason === 'other' && (
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Γράψε τον λόγο"
            aria-label="Άλλος λόγος"
            className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-highest text-sm text-on-surface"
          />
        )}
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
            className="flex-1 rounded-lg bg-tertiary px-4 py-2.5 text-sm font-bold text-on-tertiary transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Spinner size="sm" /> : <Icon name="block" size="sm" />}
            Απόρριψη αιτήματος
          </button>
        </div>
      </div>
    </Modal>
  )
}
