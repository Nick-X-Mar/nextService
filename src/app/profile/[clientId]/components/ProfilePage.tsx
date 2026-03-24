'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { styles } from '../../../../styles/styles'
import ClientNavigation from '../../../../components/ClientNavigation'
import UserInfoSection from './UserInfoSection'
import VehiclesSection from './VehiclesSection'
import { useToast } from '../../../../hooks/useToast'
import { useAuth } from '../../../../contexts/AuthContext'

interface Client {
  id: string
  firstName: string
  lastName?: string
  email?: string
  phoneNumber?: string
  address?: string
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

interface Vehicle {
  id: string
  clientId: string
  brand: string
  model: string
  modelYear?: string
  engineCC?: string
  fuelType?: string
  isAutomatic?: boolean
  is4x4?: boolean
  isTurbo?: boolean
  licensePlate?: string
  engineNumber?: string
  vinNumber?: string
  color?: string
  nickname?: string
  licensePhotoUrl?: string
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

interface ProfilePageProps {
  clientId: string
}

export default function ProfilePage({ clientId }: ProfilePageProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const { client, refreshClient } = useAuth()
  const [clientData, setClientData] = useState<Client | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isValidClientId, setIsValidClientId] = useState(false)

  // Validate clientId format
  useEffect(() => {
    if (clientId && clientId.startsWith('client-')) {
      setIsValidClientId(true)
    } else {
      setIsValidClientId(false)
      setIsLoading(false)
    }
  }, [clientId])

  // Load client data
  const loadClientData = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.client) {
          setClientData(data.client)
        } else {
          error('Σφάλμα', 'Δεν βρέθηκαν στοιχεία πελάτη')
        }
      } else {
        error('Σφάλμα', 'Δεν ήταν δυνατή η φόρτωση των στοιχείων')
      }
    } catch (err) {
      console.error('Error loading client data:', err)
      error('Σφάλμα', 'Σφάλμα κατά τη φόρτωση των στοιχείων')
    }
  }, [clientId, error])

  // Load vehicles data
  const loadVehicles = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/vehicles`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.vehicles) {
          setVehicles(data.vehicles.filter((v: Vehicle) => v.isActive !== false))
        }
      } else {
        console.error('Failed to load vehicles')
      }
    } catch (err) {
      console.error('Error loading vehicles:', err)
    }
  }, [clientId])

  // Load all data
  useEffect(() => {
    if (isValidClientId) {
      setIsLoading(true)
      Promise.all([loadClientData(), loadVehicles()]).finally(() => {
        setIsLoading(false)
      })
    }
  }, [isValidClientId, loadClientData, loadVehicles])

  // Update clientId in localStorage and refresh auth
  useEffect(() => {
    if (isValidClientId) {
      localStorage.removeItem('garageId')
      const storedClientId = localStorage.getItem('clientId')
      if (storedClientId !== clientId) {
        localStorage.setItem('clientId', clientId)
        // Auth context will handle refresh automatically
      }
    }
  }, [clientId, isValidClientId])

  // Handle client data update
  const handleClientUpdate = useCallback(async (updatedClient: Partial<Client>) => {
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedClient),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.client) {
          setClientData(data.client)
          success('Επιτυχία', 'Τα στοιχεία αποθηκεύτηκαν επιτυχώς')
          // Refresh auth context to update header
          await refreshClient(clientId)
          return true
        }
      } else {
        const errorData = await response.json()
        error('Σφάλμα', errorData.error || 'Δεν ήταν δυνατή η αποθήκευση')
        return false
      }
    } catch (err) {
      console.error('Error updating client:', err)
      error('Σφάλμα', 'Σφάλμα κατά την αποθήκευση')
      return false
    }
  }, [clientId, success, error])

  // Handle vehicle update
  const handleVehicleUpdate = useCallback(async (vehicleId: string, updatedVehicle: Partial<Vehicle>) => {
    try {
      const response = await fetch(`/api/vehicles/${vehicleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedVehicle),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.vehicle) {
          setVehicles((prev) =>
            prev.map((v) => (v.id === vehicleId ? { ...v, ...data.vehicle } : v))
          )
          success('Επιτυχία', 'Τα στοιχεία οχήματος αποθηκεύτηκαν επιτυχώς')
          return true
        }
      } else {
        const errorData = await response.json()
        error('Σφάλμα', errorData.error || 'Δεν ήταν δυνατή η αποθήκευση')
        return false
      }
    } catch (err) {
      console.error('Error updating vehicle:', err)
      error('Σφάλμα', 'Σφάλμα κατά την αποθήκευση')
      return false
    }
  }, [success, error])

  if (isLoading) {
    return (
      <section className="bg-white min-h-screen">
        <ClientNavigation clientId={clientId} />
        <div className={styles.pageCenter}>
          <div className="text-center">
            <div className={styles.loadingSpinner}></div>
            <p className={styles.bodyText}>Φόρτωση προφίλ...</p>
          </div>
        </div>
      </section>
    )
  }

  if (!isValidClientId || !clientData) {
    return (
      <section className="bg-white min-h-screen">
        <ClientNavigation clientId={clientId} />
        <div className={styles.pageCenter}>
          <div className="text-center">
            <p className={styles.bodyText}>Δεν βρέθηκαν στοιχεία</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white min-h-screen">
      <ClientNavigation clientId={clientId} />
      <div className={`${styles.container} py-24`}>
        <div className="text-center mb-8">
          <h1 className={styles.pageTitle}>
            Προφίλ <span className={styles.titleHighlight}>Χρήστη</span>
          </h1>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          {/* User Information Section */}
          <UserInfoSection
            client={clientData}
            onUpdate={handleClientUpdate}
          />

          {/* Vehicles Section */}
          <VehiclesSection
            vehicles={vehicles}
            onUpdate={handleVehicleUpdate}
          />
        </div>
      </div>
    </section>
  )
}

