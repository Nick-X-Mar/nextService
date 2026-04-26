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

// Cached identity is written to localStorage on every successful auth resolution
// so subsequent loads can skip the loading spinner — we re-render from cache and
// validate in the background. Stale data is corrected if /api/auth/me disagrees.
const AUTH_CACHE_KEY = 'authCache'

interface AuthCache {
  userType: 'client' | 'garage'
  client?: ClientUser
  garage?: GarageUser
}

function readAuthCache(): AuthCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthCache
    if (parsed.userType === 'client' && parsed.client) return parsed
    if (parsed.userType === 'garage' && parsed.garage) return parsed
    return null
  } catch {
    return null
  }
}

function writeAuthCache(cache: AuthCache | null): void {
  if (typeof window === 'undefined') return
  try {
    if (cache) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(cache))
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY)
    }
  } catch {
    // ignore quota / privacy mode failures
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userType, setUserType] = useState<UserType>(null)
  const [client, setClient] = useState<ClientUser | null>(null)
  const [garage, setGarage] = useState<GarageUser | null>(null)
  // Start in loading state on the server (no localStorage). The mount effect
  // immediately flips this to false if we have a cached identity, avoiding the
  // app-wide auth spinner on every navigation.
  const [isLoading, setIsLoading] = useState(true)

  // Clear all authentication data - memoized to prevent infinite loops
  const clearAuth = useCallback(() => {
    // Keep localStorage for backward compatibility during transition
    localStorage.removeItem('clientId')
    localStorage.removeItem('garageId')
    writeAuthCache(null)
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
          writeAuthCache({ userType: 'client', client: userData })
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
          writeAuthCache({ userType: 'garage', garage: userData })
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

  // Check authentication on mount using /api/auth/me (JWT cookie-based).
  // If we have a cached identity in localStorage, hydrate from it FIRST and
  // run the network call in the background — keeps the UI responsive across
  // page navigations after the first login.
  useEffect(() => {
    // Skip client/garage auth check on admin routes — admin has its own auth system
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      setUserType('guest')
      setIsLoading(false)
      return
    }

    // Hydrate from cache first (synchronous) so the UI doesn't flash a spinner.
    const cached = readAuthCache()
    if (cached) {
      if (cached.userType === 'client' && cached.client) {
        setClient(cached.client)
        setUserType('client')
      } else if (cached.userType === 'garage' && cached.garage) {
        setGarage(cached.garage)
        setUserType('garage')
      }
      setIsLoading(false)
    }

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
              writeAuthCache({ userType: 'client', client: userData })
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
              writeAuthCache({ userType: 'garage', garage: userData })
            }
          } else {
            // Server says we're a guest — drop any stale cache.
            writeAuthCache(null)
            setClient(null)
            setGarage(null)
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
        // Network error: keep cached identity if any, otherwise mark guest.
        if (!cached) setUserType('guest')
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
