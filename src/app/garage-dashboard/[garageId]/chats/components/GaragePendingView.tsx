'use client'

import { GarageStatusPanel, Spinner } from '@/components'
import Icon from '@/components/ui/Icon'
import { useAuth } from '@/contexts/AuthContext'
import { useGarageApprovalWatch } from '@/hooks/useGarageApprovalWatch'
import { useNavigation } from '@/hooks/useNavigation'
import { styles } from '@/styles/styles'

/**
 * What the chat pages show a garage the server answered with GARAGE_INACTIVE:
 * not approved yet, or deactivated since this tab loaded. The cached session
 * can still say "active" (a deactivation never reaches an open tab), so the
 * pages go by the server's answer — and show the same pending screen the
 * dashboard does, rather than an error or an empty list.
 *
 * `onApproved` reloads the page's data once the approval watch sees the
 * account switched on.
 */
export default function GaragePendingView({
  garageId,
  onApproved,
}: {
  garageId: string
  onApproved: () => void
}) {
  const { garage, logout } = useAuth()
  const { navigate, isNavigating } = useNavigation()
  const { checkNow, isChecking } = useGarageApprovalWatch(true, onApproved)
  const statusHref = `/garage-dashboard/${garageId}/`

  return (
    <div className="pt-6 pb-12 px-4">
      <GarageStatusPanel
        status="pending"
        companyName={garage?.companyName}
        email={garage?.email}
        onCheck={checkNow}
        isChecking={isChecking}
        onLogout={logout}
      />
      <div className="w-full max-w-lg mx-auto mt-4">
        <button
          onClick={() => navigate(statusHref)}
          disabled={isNavigating(statusHref)}
          className={`${styles.btnOutline} w-full justify-center py-3.5`}
        >
          {isNavigating(statusHref) ? <Spinner size="sm" /> : <Icon name="arrow_back" size="sm" />}
          Κατάσταση αίτησης
        </button>
      </div>
    </div>
  )
}
