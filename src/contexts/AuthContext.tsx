'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type UserType = 'client' | 'garage' | 'guest' | null

interface ClientUser {
  id: string
  firstName: string
  lastName?: string
  email?: string
  phoneNumber?: string
  isRegistered: boolean
}

interface GarageUser {
  id: string
  companyName: string
  email: string
  mobile: string
  address: string
  tin: string
  taxAuthority: string
  description?: string
  isActive: boolean
}

interface AuthContextType {
  userType: UserType
  client: ClientUser | null
  garage: GarageUser | null
  isLoading: boolean
  setClient: (client: ClientUser | null) => void
  setGarage: (garage: GarageUser | null) => void
  logout: () => void
  refreshClient: (clientId: string) => Promise<void>
  refreshGarage: (garageId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userType, setUserType] = useState<UserType>(null)
  const [client, setClient] = useState<ClientUser | null>(null)
  const [garage, setGarage] = useState<GarageUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Clear all authentication data - memoized to prevent infinite loops
  const clearAuth = useCallback(() => {
    // Keep localStorage for backward compatibility during transition
    localStorage.removeItem('clientId')
    localStorage.removeItem('garageId')
    setClient(null)
    setGarage(null)
    setUserType(null)
  }, [])

  // Logout function - calls server to clear httpOnly cookie
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore errors - we're logging out anyway
    }
    clearAuth()
    window.location.href = '/'
  }, [clearAuth])

  // Refresh client data - memoized to prevent infinite loops
  const refreshClient = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}`)
      if (response.ok) {
        const data = await response.json()
        const clientData = data.client

        if (clientData) {
          const userData: ClientUser = {
            id: clientData.id,
            firstName: clientData.firstName,
            lastName: clientData.lastName,
            email: clientData.email,
            phoneNumber: clientData.phoneNumber,
            isRegistered: !!clientData.email
          }
          setClient(userData)
          setUserType('client')
          // Keep localStorage in sync for UI purposes
          localStorage.setItem('clientId', clientData.id)
          localStorage.removeItem('garageId')
          setGarage((prevGarage) => (prevGarage ? null : prevGarage))
        } else {
          clearAuth()
        }
      } else if (response.status === 401) {
        clearAuth()
      } else {
        clearAuth()
      }
    } catch (error) {
      console.error('AuthContext: Error fetching client:', error)
      clearAuth()
    } finally {
      setIsLoading(false)
    }
  }, [clearAuth])

  // Refresh garage data - memoized to prevent infinite loops
  const refreshGarage = useCallback(async (garageId: string) => {
    try {
      const response = await fetch(`/api/garage/${garageId}`)
      if (response.ok) {
        const data = await response.json()
        const garageData = data.garage

        if (garageData && data.success) {
          const userData: GarageUser = {
            id: garageData.id,
            companyName: garageData.companyName,
            email: garageData.email,
            mobile: garageData.mobile,
            address: garageData.address,
            tin: garageData.tin,
            taxAuthority: garageData.taxAuthority,
            description: garageData.description,
            isActive: garageData.isActive
          }
          setGarage(userData)
          setUserType('garage')
          // Keep localStorage in sync for UI purposes
          localStorage.setItem('garageId', garageData.id)
          localStorage.removeItem('clientId')
          setClient((prevClient) => (prevClient ? null : prevClient))
        } else {
          clearAuth()
        }
      } else if (response.status === 401) {
        clearAuth()
      } else {
        clearAuth()
      }
    } catch (error) {
      console.error('AuthContext: Error fetching garage:', error)
      clearAuth()
    } finally {
      setIsLoading(false)
    }
  }, [clearAuth])

  // Check authentication on mount using /api/auth/me (JWT cookie-based)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          if (data.authenticated && data.user) {
            if (data.userType === 'client') {
              const userData: ClientUser = {
                id: data.user.id,
                firstName: data.user.firstName,
                lastName: data.user.lastName,
                email: data.user.email,
                phoneNumber: data.user.phoneNumber,
                isRegistered: !!data.user.email
              }
              setClient(userData)
              setUserType('client')
              localStorage.setItem('clientId', data.user.id)
              localStorage.removeItem('garageId')
            } else if (data.userType === 'garage') {
              const userData: GarageUser = {
                id: data.user.id,
                companyName: data.user.companyName,
                email: data.user.email,
                mobile: data.user.mobile,
                address: data.user.address,
                tin: data.user.tin,
                taxAuthority: data.user.taxAuthority,
                description: data.user.description,
                isActive: data.user.isActive
              }
              setGarage(userData)
              setUserType('garage')
              localStorage.setItem('garageId', data.user.id)
              localStorage.removeItem('clientId')
            }
          } else {
            setUserType('guest')
          }
        } else {
          // Not authenticated - check localStorage for backward compatibility
          const clientId = localStorage.getItem('clientId')
          const garageId = localStorage.getItem('garageId')

          if (clientId && !garageId) {
            // Old session without JWT - clear it, user needs to log in again
            clearAuth()
          } else if (garageId && !clientId) {
            clearAuth()
          }
          setUserType('guest')
        }
      } catch {
        setUserType('guest')
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [clearAuth])

  // Update userType when client or garage changes
  useEffect(() => {
    if (client) {
      setUserType('client')
    } else if (garage) {
      setUserType('garage')
    } else if (!isLoading) {
      setUserType('guest')
    }
  }, [client, garage, isLoading])

  return (
    <AuthContext.Provider
      value={{
        userType,
        client,
        garage,
        isLoading,
        setClient,
        setGarage,
        logout,
        refreshClient,
        refreshGarage
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
