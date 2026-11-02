'use client'

import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'

/** The server's answer for a request that another garage got. */
export function isAssignedElsewhere(response: Response, data: unknown): boolean {
  return response.status === 403 && (data as { code?: string } | null)?.code === 'ASSIGNED_ELSEWHERE'
}

/** What an old link to such a request opens: the request itself is gone for this garage. */
export default function AssignedElsewhere({ garageId }: { garageId: string }) {
  return (
    <div className={styles.pageCenter}>
      <div className="text-center max-w-sm px-5" data-testid="assigned-elsewhere">
        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-4">
          <Icon name="assignment_turned_in" size="lg" className="text-secondary" />
        </div>
        <h2 className={`${styles.sectionTitle} mb-2`}>Το αίτημα ανατέθηκε σε άλλο συνεργείο</h2>
        <p className={`${styles.bodyText} mb-6`}>Δεν είναι πλέον διαθέσιμο.</p>
        <Link href={`/garage-dashboard/${garageId}/`} className="text-sm font-bold text-primary hover:underline">
          Πίσω στον πίνακα
        </Link>
      </div>
    </div>
  )
}
