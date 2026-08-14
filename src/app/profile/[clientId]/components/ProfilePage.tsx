'use client'

import { useState, useEffect, useCallback } from 'react'
import { styles } from '../../../../styles/styles'
// Navigation handled by AppShell
import UserInfoSection from './UserInfoSection'
import VehiclesSection from './VehiclesSection'
import WalletSection from './WalletSection'
import AccountDangerZone from '@/components/AccountDangerZone'
import { useToast } from '../../../../hooks/useToast'
import { useAuth } from '../../../../contexts/AuthContext'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import InlineNudge from '@/components/InlineNudge'
import { useAsyncTask } from '@/hooks/useAsyncTask'
import { useNavigation } from '@/hooks/useNavigation'

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
  const { success, error } = useToast()
  const { refreshClient, logout } = useAuth()
  const { run, isPending } = useAsyncTask()
  const { navigate, isNavigating } = useNavigation()
  const [clientData, setClientData] = useState<Client | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const isValidClientId = clientId?.startsWith('client-') ?? false

  // Load all data in a single effect — no serial dependencies
  useEffect(() => {
    if (!isValidClientId) {
      setIsLoading(false)
      return
    }

    // Sync localStorage
    localStorage.removeItem('garageId')
    if (localStorage.getItem('clientId') !== clientId) {
      localStorage.setItem('clientId', clientId)
    }

    let cancelled = false

    const loadAll = async () => {
      setIsLoading(true)
      try {
        const [clientRes, vehiclesRes] = await Promise.all([
          fetch(`/api/clients/${clientId}/`),
          fetch(`/api/clients/${clientId}/vehicles/`),
        ])

        if (cancelled) return

        if (clientRes.ok) {
          const data = await clientRes.json()
          if (data.success && data.client) {
            setClientData(data.client)
          } else {
            error('Σφάλμα', 'Δεν βρέθηκαν στοιχεία πελάτη')
          }
        } else {
          error('Σφάλμα', 'Δεν ήταν δυνατή η φόρτωση των στοιχείων')
        }

        if (vehiclesRes.ok) {
          const data = await vehiclesRes.json()
          if (data.success && data.vehicles) {
            setVehicles(data.vehicles.filter((v: Vehicle) => v.isActive !== false))
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading profile:', err)
          error('Σφάλμα', 'Σφάλμα κατά τη φόρτωση των στοιχείων')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [clientId, isValidClientId, error])

  // Handle client data update
  const handleClientUpdate = useCallback(async (updatedClient: Partial<Client>) => {
    try {
      const response = await fetch(`/api/clients/${clientId}/`, {
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
          // Update auth context with the data we already have — no extra API call
          refreshClient(clientId)
          return true
        }
        return false
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
  }, [clientId, success, error, refreshClient])

  // Handle vehicle update
  const handleVehicleUpdate = useCallback(async (vehicleId: string, updatedVehicle: Partial<Vehicle>) => {
    try {
      const response = await fetch(`/api/vehicles/${vehicleId}/`, {
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
        return false
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
      <section className={styles.pageWrapper}>
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
      <section className={styles.pageWrapper}>
        <div className={styles.pageCenter}>
          <div className="text-center">
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="person_off" className="text-on-surface-variant" size="lg" />
            </div>
            <p className={styles.bodyText}>Δεν βρέθηκαν στοιχεία</p>
          </div>
        </div>
      </section>
    )
  }

  const displayName = [clientData.firstName, clientData.lastName].filter(Boolean).join(' ')

  return (
    <section className={styles.pageWrapper}>
      <div className="px-5 pt-4 pb-28 max-w-4xl mx-auto">

        {/* Profile Avatar + Name */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center mb-4 border-2 border-primary-container/30 overflow-hidden">
            <Icon name="person" filled className="text-primary" size="xl" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface text-center">
            {displayName}
          </h1>
        </div>

        <InlineNudge
          when={!clientData.phoneNumber}
          icon="sms"
          title="Λείπει το κινητό σου"
          detail="Χωρίς αυτό δεν λαμβάνεις ειδοποιήσεις όταν ένα συνεργείο απαντήσει στο αίτημά σου."
          className="mb-6"
        />

        {/* User Information Section */}
        <div id="user-info-section" className="mb-6">
          <UserInfoSection
            client={clientData}
            onUpdate={handleClientUpdate}
          />
        </div>

        {/* Vehicles Section */}
        <div id="vehicles-section" className="mb-6">
          <VehiclesSection
            vehicles={vehicles}
            onUpdate={handleVehicleUpdate}
          />
        </div>

        {/* Wallet Section */}
        {process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true' && (
          <div id="wallet-section" className="mb-6">
            <WalletSection clientId={clientId} />
          </div>
        )}

        {/* Navigation Menu Items */}
        <div className="space-y-1 mb-6">
          {[
            { icon: 'calendar_month', label: 'Τα Ραντεβού μου', href: `/requests/${clientId}?tab=appointment` },
            { icon: 'settings', label: 'Ρυθμίσεις', href: '#settings' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                if (item.href.startsWith('/')) {
                  navigate(item.href)
                }
              }}
              disabled={isNavigating(item.href)}
              className="w-full flex items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-surface-container transition-colors group disabled:opacity-60"
            >
              <Icon name={item.icon} className="text-primary" />
              <span className="flex-1 text-left text-sm font-bold text-on-surface">{item.label}</span>
              {isNavigating(item.href)
                ? <Spinner size="md" className="text-primary" />
                : <Icon name="chevron_right" className="text-on-surface-variant/50" />}
            </button>
          ))}
        </div>

        {/* GDPR Danger Zone */}
        <AccountDangerZone userId={clientId} userType="client" />

        {/* Logout Button */}
        <button
          onClick={() => run(logout)}
          disabled={isPending()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-tertiary hover:bg-error-container/30 rounded-xl transition-colors mt-6 disabled:opacity-60"
        >
          {isPending()
            ? <Spinner size="md" className="text-tertiary" />
            : <Icon name="logout" className="text-tertiary" />}
          <span className="text-sm font-bold">{isPending() ? 'Αποσύνδεση…' : 'Αποσύνδεση'}</span>
        </button>
      </div>
    </section>
  )
}
