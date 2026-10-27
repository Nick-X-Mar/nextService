'use client'

import { styles } from '@/styles/styles'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import { useNavigation } from '@/hooks/useNavigation'
import GaragePendingView from './GaragePendingView'
import { GarageChatTabs, GarageChatsHeader, GarageThreadCard, useGarageThreads } from './GarageThreadList'

interface GarageChatsPageProps {
  garageId: string
}

/** Conversations on requests still on the market. */
export default function GarageChatsPage({ garageId }: GarageChatsPageProps) {
  const { navigate, isNavigating } = useNavigation()
  const { open, appointments, isLoading, inactive, reload } = useGarageThreads()
  const feedHref = `/garage-dashboard/${garageId}/?tab=requests`

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
        title="Ανοιχτές Συνομιλίες"
        subtitle="Συνομιλίες με πελάτες για ανοιχτά αιτήματα"
        count={open.length}
      />

      <div className="max-w-3xl mx-auto px-5 md:px-8 py-5">
        <GarageChatTabs garageId={garageId} active="open" open={open} appointments={appointments} />

        {open.length > 0 ? (
          <div className="space-y-3">
            {open.map((thread) => (
              <GarageThreadCard key={thread.requestId} garageId={garageId} thread={thread} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-5">
              <Icon name="forum" size="xl" className="text-secondary" />
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Δεν υπάρχουν ανοιχτές συνομιλίες</h3>
            <p className="text-sm text-secondary mb-6 max-w-xs mx-auto">
              Δεν έχετε ακόμα συνομιλίες με πελάτες για ανοιχτά αιτήματα.
            </p>
            <button
              onClick={() => navigate(feedHref)}
              disabled={isNavigating(feedHref)}
              className={styles.btnPrimary + ' mx-auto'}
            >
              {isNavigating(feedHref) ? <Spinner size="sm" /> : <Icon name="search" size="sm" />}
              Δείτε Νέα Αιτήματα
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
