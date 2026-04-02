'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SegmentedControl } from '@/components'
import { styles } from '@/styles/styles'
import { OfferStatus } from '@/types/statuses'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'
import MyOffers from './MyOffers'
import AvailableRequests from './AvailableRequests'
import Appointments from './Appointments'
import GarageSettings from './GarageSettings'

interface GarageDashboardPageProps {
  garageId: string
}

export default function GarageDashboardPage({ garageId }: GarageDashboardPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const { userType, garage: authGarage, isLoading: authLoading } = useAuth()

  const [garageData, setGarageData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [counts, setCounts] = useState({ requests: 0, offers: 0, appointments: 0 })

  // Determine active tab from URL params, default to 'requests'
  const activeTab = tabParam === 'offers' ? 'offers'
    : tabParam === 'appointments' ? 'appointments'
    : tabParam === 'settings' ? 'settings'
    : 'requests'

  useEffect(() => {
    // Validate garage ID
    if (!garageId) {
      router.push('/login')
      return
    }

    // Wait for auth to load
    if (authLoading) {
      return
    }

    // Check if garage is pending validation
    if (userType === 'garage' && authGarage && !authGarage.isActive) {
      router.push('/login')
      return
    }

    // Check if user is authenticated as a garage
    if (userType !== 'garage' || !authGarage || authGarage.id !== garageId) {
      // User is not authenticated as this garage or is a client
      console.warn('Unauthorized access attempt to garage dashboard')
      router.push('/login')
      return
    }

    // Load garage data
    loadGarageData(garageId)
  }, [router, garageId, userType, authGarage, authLoading])

  useEffect(() => {
    // Load counts when garage data is available
    if (garageData) {
      loadCounts()
    }
  }, [garageData])

  const loadGarageData = async (garageId: string) => {
    try {
      const response = await fetch(`/api/garage/${garageId}`)

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
  }

  const loadCounts = async () => {
    try {
      // Load available requests count
      const requestsResponse = await fetch(`/api/garage/available-requests?garageId=${garageId}`)
      if (requestsResponse.ok) {
        const requestsData = await requestsResponse.json()
        if (requestsData.success) {
          setCounts(prev => ({ ...prev, requests: requestsData.requests?.length || 0 }))
        }
      }

      // Load offers count
      const offersResponse = await fetch(`/api/garage/offers?garageId=${garageId}`)
      if (offersResponse.ok) {
        const offersData = await offersResponse.json()
        if (offersData.success) {
          // Count only pending offers (exclude rejected and accepted ones)
          const offersCount = offersData.offers?.filter((offer: any) => {
            const status = offer.status?.toLowerCase()
            return status === OfferStatus.PENDING
          }).length || 0

          setCounts(prev => ({ ...prev, offers: offersCount }))

          // Count appointments (accepted offers with appointmentDate from today onwards)
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          const appointmentsCount = offersData.offers?.filter((offer: any) => {
            const isAccepted = offer.status === 'accepted' || offer.status === 'ACCEPTED'
            if (!isAccepted || !offer.appointmentDate) return false

            const appointmentDate = new Date(`${offer.appointmentDate}T00:00:00`)
            appointmentDate.setHours(0, 0, 0, 0)
            return appointmentDate >= today
          }).length || 0

          setCounts(prev => ({ ...prev, appointments: appointmentsCount }))
        }
      }
    } catch (error) {
      console.error('Error loading counts:', error)
    }
  }

  const handleTabChange = (tab: string) => {
    router.push(`/garage-dashboard/${garageId}?tab=${tab}`)
  }

  const handleLogout = () => {
    router.push('/login')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className={styles.loadingSpinner}></div>
          <p className="text-sm text-secondary mt-2">Φορτωση...</p>
        </div>
      </div>
    )
  }

  if (!garageData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="error" size="lg" className="text-tertiary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-2">Σφαλμα</h2>
          <p className="text-base text-secondary leading-relaxed mb-6">Δεν ηταν δυνατη η φορτωση των δεδομενων του συνεργειου.</p>
          <button
            onClick={handleLogout}
            className={styles.btnSecondary}
          >
            <Icon name="arrow_back" size="sm" />
            Επιστροφη στη Συνδεση
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
              { value: 'requests', label: `Αιτηματα (${counts.requests})` },
              { value: 'offers', label: `Προσφορες (${counts.offers})` },
              { value: 'appointments', label: `Ραντεβου (${counts.appointments})` }
            ]}
            value={activeTab}
            onChange={handleTabChange}
            variant="orange"
          />
        </div>

        {/* Content based on active tab */}
        <div className="space-y-6">
          {activeTab === 'requests' && <AvailableRequests garageId={garageData.id} />}
          {activeTab === 'offers' && <MyOffers garageId={garageData.id} />}
          {activeTab === 'appointments' && <Appointments garageId={garageData.id} />}
        </div>
      </>
    )
  }

  return (
    <div className="pt-2 pb-8">
      <div className={styles.container}>
        {renderContent()}
      </div>
    </div>
  )
}
