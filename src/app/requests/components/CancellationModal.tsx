'use client'

import Modal from '@/components/Modal'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import type { ServiceRequest } from '@/types/requests'
import { athensDaysUntil } from '@/utils/athensTime'
import { hasAppointmentStarted } from '@/lib/appointment-window'
import PlusVat from '@/components/PlusVat'

interface CancellationModalProps {
  isOpen: boolean
  onClose: () => void
  request: ServiceRequest
  onConfirm: () => void
  isLoading: boolean
  /**
   * Why the last attempt was refused, as the server put it — e.g. the
   * appointment started while the modal was open, or another tab already
   * cancelled it. Shown in place so the client knows the booking still stands.
   */
  error?: string | null
}

const CANCELLATION_DEADLINE_DAYS = Number(process.env.CANCELLATION_DEADLINE_DAYS || '2')
const REFUND_PERCENT = 50

export default function CancellationModal({
  isOpen,
  onClose,
  request,
  onConfirm,
  isLoading,
  error = null
}: CancellationModalProps) {
  const refundsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_REFUNDS_ENABLED === 'true'
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true'

  // Counted in Athens calendar days, as the server does, so the refund promise
  // here never disagrees with what the cancel route then credits.
  const daysUntil = request.appointmentDate ? athensDaysUntil(request.appointmentDate) ?? 0 : 0
  const started = hasAppointmentStarted(request.appointmentDate, request.appointmentTime)

  const eligible = daysUntil >= CANCELLATION_DEADLINE_DAYS
  const depositAmount = request.depositAmount
  const refundPoints = eligible && depositAmount
    ? Math.round(depositAmount * (REFUND_PERCENT / 100) * 100) / 100
    : 0

  // Noon keeps the calendar date the same in any browser zone.
  const appointmentDay = request.appointmentDate ? new Date(`${request.appointmentDate}T12:00:00`) : null
  const formattedDate = appointmentDay
    ? appointmentDay.toLocaleDateString('el-GR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    : ''

  const price = request.appointmentPrice ?? 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onClose}
      title="Ακύρωση Ραντεβού"
      size="sm"
    >
      <div className="space-y-4">
        {/* Appointment info */}
        <div className="bg-surface-container rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="calendar_month" size="sm" className="text-on-surface-variant" />
            <span className="text-sm text-on-surface">
              {formattedDate}
              {request.appointmentTime ? `, ${request.appointmentTime}` : ''}
            </span>
          </div>
          {price > 0 && (
            <div className="flex items-center gap-2">
              <Icon name="euro" size="sm" className="text-on-surface-variant" />
              <span className="text-sm text-on-surface">{price}€<PlusVat /></span>
            </div>
          )}
        </div>

        {started ? (
          <div className="flex gap-3 p-3 bg-amber-50 rounded-xl">
            <Icon name="schedule" size="sm" className="text-amber-700 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Το ραντεβού έχει ήδη ξεκινήσει και δεν μπορεί πλέον να ακυρωθεί. Επικοινωνήστε με το συνεργείο.
            </p>
          </div>
        ) : (
          <>
            {/* Refund info */}
            {paymentsEnabled && refundsEnabled && !!depositAmount && depositAmount > 0 && (
              <>
                {eligible ? (
                  <div className="flex gap-3 p-3 bg-green-50 rounded-xl">
                    <Icon name="redeem" size="sm" className="text-green-700 mt-0.5 shrink-0" />
                    <p className="text-xs text-green-800 leading-relaxed">
                      Θα λάβετε <strong>{refundPoints} πόντους</strong> στο πορτοφόλι σας.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-3 p-3 bg-amber-50 rounded-xl">
                    <Icon name="warning" size="sm" className="text-amber-700 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Δεν δικαιούστε επιστροφή πόντων λόγω εγγύτητας στο ραντεβού
                      (λιγότερο από {CANCELLATION_DEADLINE_DAYS} ημέρες πριν).
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Warning */}
            <div className="flex gap-3 p-3 bg-error-container/30 rounded-xl">
              <Icon name="info" size="sm" className="text-error mt-0.5 shrink-0" />
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Η ακύρωση είναι οριστική και δεν μπορεί να αναιρεθεί.
              </p>
            </div>
          </>
        )}

        {error && (
          <div role="alert" className="flex gap-3 p-3 bg-error-container rounded-xl">
            <Icon name="error" size="sm" className="text-error mt-0.5 shrink-0" />
            <p className="text-xs text-error leading-relaxed">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-3 text-sm font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-xl transition-colors active:scale-95 disabled:opacity-50"
          >
            Πίσω
          </button>
          {!started && (
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 px-4 py-3 text-sm font-bold text-on-error bg-error hover:bg-error/90 rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? <Spinner size="sm" /> : <Icon name="event_busy" size="sm" />}
              Επιβεβαίωση ακύρωσης
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
