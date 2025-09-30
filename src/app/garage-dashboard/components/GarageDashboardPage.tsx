'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SegmentedControl, Card } from '@/components'
import { styles } from '@/styles/styles'
import MyOffers from './MyOffers'
import AvailableRequests from './AvailableRequests'
import GarageSettings from './GarageSettings'

export default function GarageDashboardPage() {
  const [activeTab, setActiveTab] = useState('my-offers')
  const [garageData, setGarageData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check if garage is logged in
    const garageId = localStorage.getItem('garageId')
    if (!garageId) {
      router.push('/login')
      return
    }

    // Load garage data
    loadGarageData(garageId)

    // Handle hash-based tab switching
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      if (hash && ['my-offers', 'available', 'settings'].includes(hash)) {
        setActiveTab(hash)
      }
    }

    // Check initial hash
    handleHashChange()

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange)
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [router])

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

  const handleLogout = () => {
    localStorage.removeItem('garageId')
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

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'my-offers':
        return <MyOffers garageId={garageData.id} />
      case 'available':
        return <AvailableRequests garageId={garageData.id} />
      case 'settings':
        return <GarageSettings garageData={garageData} onUpdate={setGarageData} />
      default:
        return <MyOffers garageId={garageData.id} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className={`${styles.pageTitle} text-2xl`}>
                {garageData.companyName}
              </h1>
              <p className={styles.bodyText}>
                Πίνακας Ελέγχου Συνεργείου
              </p>
            </div>
            <button
              onClick={handleLogout}
              className={`${styles.btnSecondary} text-sm`}
            >
              Αποσύνδεση
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="mb-8">
          <SegmentedControl
            options={[
              { value: 'my-offers', label: 'Οι Προσφορές μου' },
              { value: 'available', label: 'Διαθέσιμα Αιτήματα' },
              { value: 'settings', label: 'Ρυθμίσεις' }
            ]}
            value={activeTab}
            onChange={(tab) => {
              setActiveTab(tab)
              window.location.hash = tab
            }}
            variant="orange"
            size="md"
            className="max-w-md"
          />
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {renderActiveTab()}
        </div>
      </div>
    </div>
  )
}
