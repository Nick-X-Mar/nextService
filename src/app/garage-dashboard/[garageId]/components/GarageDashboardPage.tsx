'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SegmentedControl } from '@/components'
import { styles } from '@/styles/styles'
import { OfferStatus } from '@/types/statuses'
import GarageNavigation from '@/components/GarageNavigation'
import { useAuth } from '@/contexts/AuthContext'
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className={styles.bodyText}>Φόρτωση...</p>
        </div>
      </div>
    )
  }

  if (!garageData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className={`${styles.pageTitle} mb-4`}>Σφάλμα</h2>
          <p className={styles.bodyText}>Δεν ήταν δυνατή η φόρτωση των δεδομένων του συνεργείου.</p>
          <button
            onClick={handleLogout}
            className={`${styles.btnSecondary} mt-4`}
          >
            Επιστροφή στη Σύνδεση
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
        <div className="mb-6">
          <SegmentedControl
            options={[
              { value: 'requests', label: `Νέα Αιτήματα (${counts.requests})` },
              { value: 'offers', label: `Προσφορές από Εμένα (${counts.offers})` },
              { value: 'appointments', label: `Ραντεβού (${counts.appointments})` }
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
    <div className="min-h-screen bg-gray-50">
      {/* Navigation with header integrated */}
      {garageData && (
        <GarageNavigation garageId={garageId} companyName={garageData.companyName} />
      )}

      {/* Main Content */}
      <div className={`${styles.container} py-8`}>
        {renderContent()}
      </div>
    </div>
  )
}
