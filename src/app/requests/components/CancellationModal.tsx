'use client'

import Modal from '@/components/Modal'
import Icon from '@/components/ui/Icon'
import type { ServiceRequest } from '@/types/requests'
import { differenceInCalendarDays, parseISO } from 'date-fns'

interface CancellationModalProps {
  isOpen: boolean
  onClose: () => void
  request: ServiceRequest
  onConfirm: () => void
  isLoading: boolean
}

const CANCELLATION_DEADLINE_DAYS = Number(process.env.CANCELLATION_DEADLINE_DAYS || '2')
const REFUND_PERCENT = 50

export default function CancellationModal({
  isOpen,
  onClose,
  request,
  onConfirm,
  isLoading
}: CancellationModalProps) {
  const refundsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_REFUNDS_ENABLED === 'true'
  const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const appointmentDate = request.appointmentDate ? parseISO(request.appointmentDate) : null
  const daysUntil = appointmentDate
    ? differenceInCalendarDays(appointmentDate, today)
    : 0

  const eligible = daysUntil >= CANCELLATION_DEADLINE_DAYS
  const depositAmount = request.depositAmount
  const refundPoints = eligible && depositAmount
    ? Math.round(depositAmount * (REFUND_PERCENT / 100) * 100) / 100
    : 0

  const formattedDate = appointmentDate
    ? appointmentDate.toLocaleDateString('el-GR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    : ''

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ακύρωση Ραντεβού"
      size="sm"
    >
      <div className="space-y-4">
        {/* Appointment info */}
        <div className="bg-surface-container rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="calendar_month" size="sm" className="text-on-surface-variant" />
            <span className="text-sm text-on-surface">{formattedDate}</span>
          </div>
          {request.appointmentPrice && (
            <div className="flex items-center gap-2">
              <Icon name="euro" size="sm" className="text-on-surface-variant" />
              <span className="text-sm text-on-surface">{request.appointmentPrice}€</span>
            </div>
          )}
        </div>

        {/* Refund info */}
        {paymentsEnabled && refundsEnabled && depositAmount && depositAmount > 0 && (
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

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-3 text-sm font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-xl transition-colors disabled:opacity-50"
          >
            Πίσω
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-3 text-sm font-bold text-on-error bg-error hover:bg-error/90 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-on-error/30 border-t-on-error rounded-full animate-spin" />
                Ακύρωση...
              </>
            ) : (
              'Επιβεβαίωση ακύρωσης'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
