'use client'

import { useState } from 'react'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'
import { getCategoryText } from '@/utils/categoryLabels'
import { isCompletionDue } from '@/types/reviews'
import type { BookedJob } from '@/types/bookedJobs'
import CompletionModal from './CompletionModal'
import { formatAppointment } from './offerStatus'
import { clientDisplayName } from './clientLabel'
import { PLUS_VAT } from '@/utils/vat'

interface BookedJobsPanelProps {
  jobs: BookedJob[]
  /** A job was closed (or was already closed elsewhere): reload the list. */
  onChanged: () => void
}

const vehicleLabel = (job: BookedJob) =>
  [job.vehicle?.brand, job.vehicle?.model].filter(Boolean).join(' ') || 'Όχημα'

/**
 * The bookings a deactivated garage still holds, and the way to close them.
 *
 * Deactivation keeps a garage off the marketplace but doesn't undo the jobs it
 * had already booked; the client still expects them, and the platform still
 * needs to know what happened. A job can be declared once its slot is due —
 * the same rule, the same form and the same route as the Ραντεβού tab.
 */
export default function BookedJobsPanel({ jobs, onChanged }: BookedJobsPanelProps) {
  const [completing, setCompleting] = useState<BookedJob | null>(null)

  if (jobs.length === 0) return null

  return (
    <section className="w-full max-w-lg mx-auto mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="event_available" size="md" className="text-primary" />
        <h3 className={styles.cardTitle}>Κλεισμένα ραντεβού</h3>
      </div>
      <p className="text-sm text-secondary mb-4">
        Τα ραντεβού που είχατε ήδη κλείσει ισχύουν. Μόλις περάσει η ώρα τους, πείτε μας αν έγινε η
        επισκευή και τι χρεώσατε.
      </p>

      <div className="space-y-3">
        {jobs.map((job) => {
          const due = isCompletionDue(job.appointmentDate, job.appointmentTime)
          return (
            <div
              key={job.requestId}
              data-testid="booked-job"
              className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-container-lowest p-3 border border-outline-variant/10"
            >
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-bold text-on-surface">{vehicleLabel(job)}</p>
                <p className="text-xs text-on-surface-variant">
                  {getCategoryText(job.category)}
                  {' · '}
                  {clientDisplayName(job.clientFirstName ? { firstName: job.clientFirstName } : null)}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {formatAppointment(job.appointmentDate, job.appointmentTime)}
                  {typeof job.price === 'number' && ` · ${job.price.toLocaleString('el-GR')} € ${PLUS_VAT}`}
                </p>
              </div>
              {due ? (
                <button
                  onClick={() => setCompleting(job)}
                  className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-4 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                  <Icon name="check_circle" size="sm" />
                  Δήλωσέ το
                </button>
              ) : (
                <span className="text-xs font-medium text-on-surface-variant">
                  Η δήλωση ανοίγει μετά το ραντεβού
                </span>
              )}
            </div>
          )
        })}
      </div>

      {completing && (
        <CompletionModal
          isOpen
          onClose={() => setCompleting(null)}
          requestId={completing.requestId}
          vehicleLabel={vehicleLabel(completing)}
          quotedPrice={completing.price ?? undefined}
          onCompleted={onChanged}
        />
      )}
    </section>
  )
}
