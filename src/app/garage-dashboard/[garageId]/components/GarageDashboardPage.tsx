'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SegmentedControl, GarageStatusPanel, Spinner } from '@/components'
import AlertStack from '@/components/AlertStack'
import { useNavigation } from '@/hooks/useNavigation'
import { styles } from '@/styles/styles'
import { OfferStatus, ServiceRequestStatus } from '@/types/statuses'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'
import MyOffers from './MyOffers'
import AvailableRequests from './AvailableRequests'
import Appointments from './Appointments'
import GarageSettings from './GarageSettings'
import ActivationWelcome from './ActivationWelcome'
import { useRealtimeRequests, type BroadcastRequest, type RequestUpdatePayload } from '@/hooks/useRealtimeRequests'
import { useToast } from '@/hooks/useToast'
import { useNotifications } from '@/contexts/NotificationsContext'
import { useGarageApprovalWatch } from '@/hooks/useGarageApprovalWatch'
import { isGarageInactive } from './garageInactive'
import { garageOfferState, isUpcomingAppointment } from './offerStatus'
import BookedJobsPanel from './BookedJobsPanel'
import type { BookedJob, GarageAccountState } from '@/types/bookedJobs'

interface GarageDashboardPageProps {
  garageId: string
}

interface GarageData {
  id: string
  companyName: string
  email: string
  mobile: string
  address: string
  tin: string
  taxAuthority: string
  description?: string
  workdayStartTime?: string
  benefits?: string[]
  isActive?: boolean
}

interface OfferLite {
  id?: string
  status?: OfferStatus | string
  appointmentDate?: string
  serviceRequest?: { status?: string; acceptedOfferId?: string | null } | null
}

export default function GarageDashboardPage({ garageId }: GarageDashboardPageProps) {
  const router = useRouter()
  const { navigate, isNavigating } = useNavigation()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const { userType, garage: authGarage, isLoading: authLoading, logout } = useAuth()

  const [garageData, setGarageData] = useState<GarageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Set when a marketplace call answers GARAGE_INACTIVE. The cached session
  // can still say "active" — an admin's deactivation never reaches an open tab
  // — so the server's answer is what decides, not the cache.
  const [inactiveFromApi, setInactiveFromApi] = useState(false)
  const markInactive = useCallback(() => setInactiveFromApi(true), [])
  const isPendingValidation =
    userType === 'garage' &&
    !!authGarage &&
    (!authGarage.isActive || garageData?.isActive === false || inactiveFromApi)
  const [counts, setCounts] = useState({ requests: 0, offers: 0, appointments: 0 })
  // For a garage off the marketplace: whether it is awaiting approval or was
  // deactivated, and the jobs it had already booked (those it can still close).
  const [accountState, setAccountState] = useState<GarageAccountState>('pending')
  const [bookedJobs, setBookedJobs] = useState<BookedJob[]>([])
  const { success } = useToast()
  const { markRequestsSeen } = useNotifications()
  // Track which request ids we've already seen via realtime so the badge
  // counter and toast don't fire twice (e.g. an event arriving twice during
  // a flaky reconnect).
  const seenRequestIdsRef = useRef<Set<string>>(new Set())

  // Determine active tab from URL params, default to 'requests'
  const activeTab = tabParam === 'offers' ? 'offers'
    : tabParam === 'appointments' ? 'appointments'
    : tabParam === 'settings' ? 'settings'
    : 'requests'

  const loadGarageData = useCallback(async (garageId: string) => {
    try {
      const response = await fetch(`/api/garage/${garageId}/`)

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Garage not found')
        }
        throw new Error('Failed to load garage data')
      }

      const data = await response.json()

      if (data.success) {
        setGarageData(data.garage)
      } else {
        throw new Error(data.error || 'Failed to load garage data')
      }
    } catch (error) {
      console.error('Error loading garage data:', error)
      // Set error state or show error message
      setGarageData(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadCounts = useCallback(async () => {
    try {
      // countOnly skips the per-request client/vehicle/presigned-URL hydration —
      // this is a badge, it only needs ids. It also counts every pending request
      // rather than just the first page, which the full feed could not do.
      const requestsResponse = await fetch(
        `/api/garage/available-requests/?garageId=${garageId}&countOnly=1`
      )
      const requestsData = await requestsResponse.json().catch(() => null)
      if (isGarageInactive(requestsResponse, requestsData)) {
        markInactive()
        return
      }
      if (requestsResponse.ok && requestsData?.success) {
        const ids: string[] = requestsData.requestIds || []
        setCounts(prev => ({ ...prev, requests: requestsData.count ?? ids.length }))
        // Seed the seen-set so subsequent request-update events about
        // these existing requests can decrement the badge correctly.
        seenRequestIdsRef.current = new Set(ids)
      }

      // Load offers count
      const offersResponse = await fetch(`/api/garage/offers/?garageId=${garageId}`)
      if (offersResponse.ok) {
        const offersData = await offersResponse.json()
        if (offersData.success) {
          // Offers still in play: pending, on a request that is itself still
          // pending. One left "pending" on a request that was booked elsewhere
          // or cancelled is closed, whatever its own flag says.
          const offersCount = offersData.offers?.filter((offer: OfferLite) => {
            const status = (offer.status as string | undefined)?.toLowerCase()
            return garageOfferState(status, offer.serviceRequest, offer.id) === OfferStatus.PENDING
          }).length || 0

          setCounts(prev => ({ ...prev, offers: offersCount }))

          const appointmentsCount = offersData.offers?.filter((offer: OfferLite) => isUpcomingAppointment(offer)).length || 0

          setCounts(prev => ({ ...prev, appointments: appointmentsCount }))
        }
      }
    } catch (error) {
      console.error('Error loading counts:', error)
    }
  }, [garageId, markInactive])

  useEffect(() => {
    // Validate garage ID
    if (!garageId) {
      router.push('/login/')
      return
    }

    // Wait for auth to load
    if (authLoading) {
      return
    }

    // Signed in as a different garage (usually a stale cached identity from a
    // previous session): send them to their own dashboard rather than to the
    // login form, which would only bounce them back here.
    if (userType === 'garage' && authGarage && authGarage.id !== garageId) {
      router.replace(`/garage-dashboard/${authGarage.id}/`)
      return
    }

    // Not a garage session at all — keep the destination so login can return
    // them here instead of dropping them on a generic page.
    if (userType !== 'garage' || !authGarage) {
      router.push(`/login/?next=${encodeURIComponent(`/garage-dashboard/${garageId}/`)}`)
      return
    }

    // Pending garages load their data too: they stay on this page (bouncing to
    // /login only bounced them straight back) and may edit their profile from
    // it while they wait — the status panel renders below.
    loadGarageData(garageId)
  }, [router, garageId, userType, authGarage, authLoading, loadGarageData])

  useEffect(() => {
    // Counts come off the marketplace routes, which a pending garage cannot use.
    if (garageData && !isPendingValidation) {
      loadCounts()
    }
  }, [garageData, isPendingValidation, loadCounts])

  const tabHref = (tab: string) => `/garage-dashboard/${garageId}/?tab=${tab}`
  const statusHref = `/garage-dashboard/${garageId}/`

  const handleTabChange = (tab: string) => {
    navigate(tabHref(tab))
  }

  // Sitting on the requests feed *is* reading the notifications, so the bell
  // empties as soon as the tab is open — and again for anything that lands while
  // the garage stays there.
  useEffect(() => {
    if (activeTab === 'requests') markRequestsSeen()
  }, [activeTab, counts.requests, markRequestsSeen])

  // ─── Realtime: badge counter ───
  // Lives at the dashboard level so it stays mounted across tab switches.

  // Only the tab counter here — the toast, the chime and the header bell are the
  // app shell's job (NotificationsContext), so they fire on every garage screen
  // and don't double up when the dashboard happens to be the one open.
  const handleRealtimeNewRequest = useCallback((broadcast: BroadcastRequest) => {
    if (seenRequestIdsRef.current.has(broadcast.id)) return
    seenRequestIdsRef.current.add(broadcast.id)
    setCounts(prev => ({ ...prev, requests: prev.requests + 1 }))
  }, [])

  const handleRealtimeRequestUpdate = useCallback((update: RequestUpdatePayload) => {
    if (!update.status || update.status === ServiceRequestStatus.PENDING) return
    if (!seenRequestIdsRef.current.has(update.requestId)) {
      // Wasn't in our tracked set — likely closed before we ever saw it; the
      // counter is best-effort, so skip.
      return
    }
    seenRequestIdsRef.current.delete(update.requestId)
    setCounts(prev => ({ ...prev, requests: Math.max(0, prev.requests - 1) }))
  }, [])

  const refreshCountsAfterReconnect = useCallback(() => {
    // Fill any gap of events lost during the disconnect window.
    seenRequestIdsRef.current.clear()
    if (garageData) loadCounts()
  }, [garageData, loadCounts])

  // While the application is under review, watch for the admin's approval so
  // the dashboard opens by itself instead of waiting for a manual reload.
  const { checkNow, isChecking } = useGarageApprovalWatch(
    isPendingValidation,
    () => {
      // The watch has already refreshed the session, which reloads garageData.
      setInactiveFromApi(false)
      success('Ο λογαριασμός σας ενεργοποιήθηκε!', 'Καλώς ήρθατε — μπορείτε πλέον να δείτε αιτήματα πελατών.')
    }
  )

  useRealtimeRequests({
    enabled: !!garageData && !isPendingValidation,
    onNewRequest: handleRealtimeNewRequest,
    onRequestUpdate: handleRealtimeRequestUpdate,
    onReconnect: refreshCountsAfterReconnect,
  })

  const loadBookedJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/garage/booked-jobs/')
      const data = await res.json()
      if (!res.ok || !data.success) return
      setAccountState(data.account as GarageAccountState)
      setBookedJobs(Array.isArray(data.jobs) ? (data.jobs as BookedJob[]) : [])
    } catch (error) {
      console.error('Error loading booked jobs:', error)
    }
  }, [])

  useEffect(() => {
    if (isPendingValidation) loadBookedJobs()
  }, [isPendingValidation, loadBookedJobs])

  const handleLogout = () => {
    navigate('/login/')
  }

  const loadingView = (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className={styles.loadingSpinner}></div>
        <p className="text-sm text-secondary mt-2">Φόρτωση...</p>
      </div>
    </div>
  )

  if (isPendingValidation) {
    // The profile is the one thing a garage under review can usefully work on.
    if (activeTab === 'settings' && (isLoading || garageData)) {
      if (!garageData) return loadingView
      return (
        <div className="pt-2 pb-8">
          <div className={styles.container}>
            <button
              onClick={() => navigate(statusHref)}
              disabled={isNavigating(statusHref)}
              className={`${styles.btnGhost} mb-4 -ml-4`}
            >
              {isNavigating(statusHref) ? <Spinner size="sm" /> : <Icon name="arrow_back" size="sm" />}
              Κατάσταση αίτησης
            </button>
            <GarageSettings garageData={garageData} onUpdate={setGarageData} />
          </div>
        </div>
      )
    }

    return (
      <div className="pt-6 pb-12 px-4">
        <GarageStatusPanel
          status={accountState === 'deactivated' ? 'deactivated' : 'pending'}
          companyName={garageData?.companyName || authGarage?.companyName}
          email={garageData?.email || authGarage?.email}
          onCheck={checkNow}
          isChecking={isChecking}
          onLogout={logout}
        />
        <BookedJobsPanel jobs={bookedJobs} onChanged={loadBookedJobs} />
        <div className="w-full max-w-lg mx-auto mt-4">
          <button
            onClick={() => navigate(tabHref('settings'))}
            disabled={isNavigating(tabHref('settings'))}
            className={`${styles.btnOutline} w-full justify-center py-3.5`}
          >
            {isNavigating(tabHref('settings')) ? <Spinner size="sm" /> : <Icon name="storefront" size="sm" />}
            Στοιχεία συνεργείου
          </button>
          {accountState !== 'deactivated' && (
            <p className={`${styles.smallText} text-center mt-3`}>
              Όσο περιμένετε, συμπληρώστε το ωράριο, την περιγραφή και τις παροχές σας.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (isLoading) return loadingView

  if (!garageData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="error" size="lg" className="text-tertiary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-2">Σφάλμα</h2>
          <p className="text-base text-secondary leading-relaxed mb-6">Δεν ήταν δυνατή η φόρτωση των στοιχείων του συνεργείου.</p>
          <button
            onClick={handleLogout}
            disabled={isNavigating('/login/')}
            className={styles.btnSecondary}
          >
            {isNavigating('/login/')
              ? <Spinner size="sm" />
              : <Icon name="arrow_back" size="sm" />}
            Επιστροφή στη σύνδεση
          </button>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    if (!garageData) return null

    // Settings tab shows settings component directly
    if (activeTab === 'settings') {
      return <GarageSettings garageData={garageData} onUpdate={setGarageData} />
    }

    // Other tabs show unified content with SegmentedControl
    return (
      <>
        {/* SegmentedControl for requests/offers/appointments */}
        <div className="mb-4">
          <SegmentedControl
            options={[
              { value: 'requests', label: `Αιτήματα (${counts.requests})` },
              { value: 'offers', label: `Προσφορές (${counts.offers})` },
              { value: 'appointments', label: `Ραντεβού (${counts.appointments})` }
            ]}
            value={activeTab}
            onChange={handleTabChange}
            variant="orange"
          />
        </div>

        {/* Content based on active tab */}
        <div className="space-y-6">
          {activeTab === 'requests' && (
            <AvailableRequests garageId={garageData.id} onInactive={markInactive} />
          )}
          {activeTab === 'offers' && <MyOffers garageId={garageData.id} onInactive={markInactive} />}
          {activeTab === 'appointments' && <Appointments garageId={garageData.id} onInactive={markInactive} />}
        </div>
      </>
    )
  }

  return (
    <div className="pt-2 pb-8">
      <div className={styles.container}>
        <ActivationWelcome
          garageId={garageId}
          companyName={authGarage?.companyName}
          activatedAt={authGarage?.activatedAt}
        />
        {/* Renders nothing when there is nothing waiting on the user. */}
        <AlertStack className="mb-6" />
        {renderContent()}
      </div>
    </div>
  )
}
