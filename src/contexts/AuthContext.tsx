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
    localStorage.removeItem('clientId')
    localStorage.removeItem('garageId')
    setClient(null)
    setGarage(null)
    setUserType(null)
  }, [])

  // Logout function
  const logout = () => {
    clearAuth()
    // Reload to clear all state
    window.location.href = '/'
  }

  // Refresh client data - memoized to prevent infinite loops
  const refreshClient = useCallback(async (clientId: string) => {
    try {
      console.log('AuthContext: Refreshing client with clientId:', clientId)
      const response = await fetch(`/api/clients/${clientId}`)
      if (response.ok) {
        const data = await response.json()
        const clientData = data.client
        
        console.log('AuthContext: Received client data:', clientData)
        
        if (clientData) {
          const userData: ClientUser = {
            id: clientData.id,
            firstName: clientData.firstName,
            lastName: clientData.lastName,
            email: clientData.email,
            phoneNumber: clientData.phoneNumber,
            isRegistered: !!clientData.email
          }
          console.log('AuthContext: Setting client data:', userData)
          setClient(userData)
          setUserType('client')
          // Clear any existing garage session
          localStorage.removeItem('garageId')
          setGarage((prevGarage) => (prevGarage ? null : prevGarage))
        } else {
          console.log('AuthContext: No client data, clearing auth')
          clearAuth()
        }
      } else {
        console.log('AuthContext: Response not ok, clearing auth')
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
      console.log('AuthContext: Refreshing garage with garageId:', garageId)
      const response = await fetch(`/api/garage/${garageId}`)
      if (response.ok) {
        const data = await response.json()
        const garageData = data.garage
        
        console.log('AuthContext: Received garage data:', garageData)
        
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
          console.log('AuthContext: Setting garage data:', userData)
          setGarage(userData)
          setUserType('garage')
          // Clear any existing client session
          localStorage.removeItem('clientId')
          setClient((prevClient) => (prevClient ? null : prevClient))
        } else {
          console.log('AuthContext: No garage data, clearing auth')
          clearAuth()
        }
      } else {
        console.log('AuthContext: Response not ok, clearing auth')
        clearAuth()
      }
    } catch (error) {
      console.error('AuthContext: Error fetching garage:', error)
      clearAuth()
    } finally {
      setIsLoading(false)
    }
  }, [clearAuth])

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const clientId = localStorage.getItem('clientId')
      const garageId = localStorage.getItem('garageId')

      // If both exist, there's a conflict - clear both
      if (clientId && garageId) {
        console.warn('AuthContext: Both clientId and garageId found in localStorage. Clearing both.')
        clearAuth()
        setIsLoading(false)
        return
      }

      // Check for client authentication
      if (clientId) {
        await refreshClient(clientId)
        return
      }

      // Check for garage authentication
      if (garageId) {
        await refreshGarage(garageId)
        return
      }

      // No authentication found
      setUserType('guest')
      setIsLoading(false)
    }

    checkAuth()
  }, [])

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

