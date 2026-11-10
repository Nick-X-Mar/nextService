'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'
import { useNotifications } from '@/contexts/NotificationsContext'

/** The server's answer for a request that another garage got. */
export function isAssignedElsewhere(response: Response, data: unknown): boolean {
  return response.status === 403 && (data as { code?: string } | null)?.code === 'ASSIGNED_ELSEWHERE'
}

/**
 * What an old link to such a request opens: the request itself is gone for this
 * garage. Opening it is also what clears the «Ο πελάτης επέλεξε άλλη προσφορά»
 * alert, which links here.
 */
export default function AssignedElsewhere({ garageId, requestId }: { garageId: string; requestId?: string }) {
  const { refresh } = useNotifications()
  useEffect(() => {
    if (!requestId) return
    fetch('/api/notifications/seen/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'lost', id: requestId }),
    })
      .then(() => refresh())
      .catch(() => { /* a stale alert only */ })
  }, [requestId, refresh])

  return (
    <div className={styles.pageCenter}>
      <div className="text-center max-w-sm px-5" data-testid="assigned-elsewhere">
        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-4">
          <Icon name="assignment_turned_in" size="lg" className="text-secondary" />
        </div>
        <h2 className={`${styles.sectionTitle} mb-2`}>Ο πελάτης επέλεξε άλλη προσφορά</h2>
        <p className={`${styles.bodyText} mb-6`}>Το αίτημα ανατέθηκε σε άλλο συνεργείο και δεν είναι πλέον διαθέσιμο. Ευχαριστούμε για την προσφορά σας.</p>
        <Link href={`/garage-dashboard/${garageId}/`} className="text-sm font-bold text-primary hover:underline">
          Πίσω στον πίνακα
        </Link>
      </div>
    </div>
  )
}
