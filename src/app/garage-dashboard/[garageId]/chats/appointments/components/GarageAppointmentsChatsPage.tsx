'use client'

import { styles } from '@/styles/styles'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import GaragePendingView from '../../components/GaragePendingView'
import { ServiceRequestStatus } from '@/types/statuses'
import {
  GarageChatTabs,
  GarageChatsHeader,
  GarageThreadCard,
  useGarageThreads,
} from '../../components/GarageThreadList'

interface GarageAppointmentsChatsPageProps {
  garageId: string
}

/**
 * Conversations on jobs this garage won: booked appointments — including ones
 * whose slot has passed and still need closing — and completed jobs, where
 * the client can still reach the garage and the garage rates the client.
 */
export default function GarageAppointmentsChatsPage({ garageId }: GarageAppointmentsChatsPageProps) {
  const { navigate, isNavigating } = useNavigation()
  const { open, appointments, isLoading, inactive, reload } = useGarageThreads()
  const appointmentsHref = `/garage-dashboard/${garageId}/?tab=appointments`

  const booked = appointments.filter((t) => t.status !== ServiceRequestStatus.COMPLETED)
  const completed = appointments.filter((t) => t.status === ServiceRequestStatus.COMPLETED)

  if (inactive) return <GaragePendingView garageId={garageId} onApproved={reload} />

  if (isLoading) {
    return (
      <div className={styles.pageCenter}>
        <div className="text-center">
          <div className={styles.loadingSpinner}></div>
          <p className={styles.bodyText}>Φόρτωση συνομιλιών...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageWrapper}>
      <GarageChatsHeader
        garageId={garageId}
        title="Ραντεβού"
        subtitle="Συνομιλίες για τα ραντεβού και τις εργασίες σας"
        count={appointments.length}
      />

      <div className="max-w-3xl mx-auto px-5 md:px-8 py-5">
        <GarageChatTabs garageId={garageId} active="appointment" open={open} appointments={appointments} />

        {appointments.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-5">
              <Icon name="event_busy" size="xl" className="text-secondary" />
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Δεν υπάρχουν ραντεβού</h3>
            <p className="text-sm text-secondary mb-6 max-w-xs mx-auto">
              Όταν ένας πελάτης αποδεχτεί προσφορά σας, η συνομιλία θα εμφανιστεί εδώ.
            </p>
            <button
              onClick={() => navigate(appointmentsHref)}
              disabled={isNavigating(appointmentsHref)}
              className={styles.btnPrimary + ' mx-auto'}
            >
              {isNavigating(appointmentsHref) ? <Spinner size="sm" /> : <Icon name="calendar_month" size="sm" />}
              Δείτε τα Ραντεβού
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {booked.length > 0 && (
              <section className="space-y-3">
                <h2 className={styles.labelUpper}>Προγραμματισμένα</h2>
                {booked.map((thread) => (
                  <GarageThreadCard key={thread.requestId} garageId={garageId} thread={thread} />
                ))}
              </section>
            )}
            {completed.length > 0 && (
              <section className="space-y-3">
                <h2 className={styles.labelUpper}>Ολοκληρωμένα</h2>
                {completed.map((thread) => (
                  <GarageThreadCard key={thread.requestId} garageId={garageId} thread={thread} />
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
