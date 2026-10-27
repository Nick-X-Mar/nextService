'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import appSyncService from '@/lib/appsync-service'
import { clearFormData } from '@/utils/formStorage'

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
  /** Set by the admin activation — drives the one-off welcome banner */
  activatedAt?: string
}

interface AuthContextType {
  userType: UserType
  client: ClientUser | null
  garage: GarageUser | null
  isLoading: boolean
  /**
   * True only once the server has answered who we are. The localStorage cache
   * below can populate `client`/`garage` instantly for rendering, but it must
   * never be enough to *act* on — redirecting someone into an account or
   * attaching data to it has to wait for this flag, otherwise a browser left
   * signed in on another machine hands the next person the previous identity.
   */
  isVerified: boolean
  setClient: (client: ClientUser | null) => void
  setGarage: (garage: GarageUser | null) => void
  logout: () => void
  refreshClient: (clientId: string) => Promise<void>
  refreshGarage: (garageId: string) => Promise<void>
  /**
   * Re-asks the server who this browser is and adopts the answer. For flows
   * where the session cookie can change underneath the page — e.g. a guest
   * whose confirmation link was opened in another tab of the same browser.
   * Resolves to the confirmed identity, or null when signed out. A network
   * failure rejects and leaves the current state untouched.
   */
  syncSession: () => Promise<{ userType: 'client' | 'garage'; id: string } | null>
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
  // Flipped once — and only once — a server round-trip has confirmed (or
  // denied) the session. Never reset by clearAuth: "the server said no" is
  // itself a verified answer.
  const [isVerified, setIsVerified] = useState(false)

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
      await fetch('/api/auth/logout/', { method: 'POST' })
    } catch {
      // Ignore errors - we're logging out anyway
    }
    // Explicitly, not only through the identity effect below: the full-page
    // navigation that follows may well beat the effect to it.
    clearFormData()
    clearAuth()
    window.location.href = '/'
  }, [clearAuth])

  // Refresh client data - memoized to prevent infinite loops
  const refreshClient = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}/`)
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
      // Every path through this function has either heard back from the server
      // or given up and cleared the session — both are settled answers.
      setIsVerified(true)
    }
  }, [clearAuth])

  // Refresh garage data - memoized to prevent infinite loops
  const refreshGarage = useCallback(async (garageId: string) => {
    try {
      const response = await fetch(`/api/garage/${garageId}/`)
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
            isActive: garageData.isActive,
            activatedAt: garageData.activatedAt || undefined
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
      // Every path through this function has either heard back from the server
      // or given up and cleared the session — both are settled answers.
      setIsVerified(true)
    }
  }, [clearAuth])

  // Adopts an /api/auth/me answer as the current identity.
  const applyMeResponse = useCallback((data: {
    authenticated?: boolean
    userType?: string
    user?: Record<string, unknown> & { id: string }
  } | null): { userType: 'client' | 'garage'; id: string } | null => {
    const user = data?.authenticated ? data.user : undefined
    if (user && data?.userType === 'client') {
      const userData: ClientUser = {
        id: user.id,
        firstName: user.firstName as string,
        lastName: user.lastName as string | undefined,
        email: user.email as string | undefined,
        phoneNumber: user.phoneNumber as string | undefined,
        isRegistered: !!user.email
      }
      setClient(userData)
      setGarage(null)
      setUserType('client')
      localStorage.setItem('clientId', user.id)
      localStorage.removeItem('garageId')
      writeAuthCache({ userType: 'client', client: userData })
      return { userType: 'client', id: user.id }
    }
    if (user && data?.userType === 'garage') {
      const userData: GarageUser = {
        id: user.id,
        companyName: user.companyName as string,
        email: user.email as string,
        mobile: user.mobile as string,
        address: user.address as string,
        tin: user.tin as string,
        taxAuthority: user.taxAuthority as string,
        description: user.description as string | undefined,
        isActive: user.isActive as boolean,
        activatedAt: (user.activatedAt as string) || undefined
      }
      setGarage(userData)
      setClient(null)
      setUserType('garage')
      localStorage.setItem('garageId', user.id)
      localStorage.removeItem('clientId')
      writeAuthCache({ userType: 'garage', garage: userData })
      return { userType: 'garage', id: user.id }
    }
    // The server did not recognise us. Drop every trace of the previous
    // identity — leaving it behind is what let a forgotten session on a
    // shared browser resurface for whoever opened the app next.
    clearAuth()
    setUserType('guest')
    return null
  }, [clearAuth])

  const syncSession = useCallback(async () => {
    const response = await fetch('/api/auth/me/', { cache: 'no-store' })
    if (response.status >= 500) throw new Error(`auth/me ${response.status}`)
    const data = response.ok ? await response.json() : null
    const identity = applyMeResponse(data)
    setIsVerified(true)
    setIsLoading(false)
    return identity
  }, [applyMeResponse])

  // Check authentication on mount using /api/auth/me (JWT cookie-based).
  // If we have a cached identity in localStorage, hydrate from it FIRST and
  // run the network call in the background — keeps the UI responsive across
  // page navigations after the first login.
  useEffect(() => {
    // Skip client/garage auth check on admin routes — admin has its own auth system
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      setUserType('guest')
      setIsLoading(false)
      setIsVerified(true)
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
        const response = await fetch('/api/auth/me/')
        applyMeResponse(response.ok ? await response.json() : null)
        // An answer from the server either way, so the identity is now
        // confirmed. Deliberately not in `finally`: a network failure leaves
        // the cached identity in place and must NOT be marked verified.
        setIsVerified(true)
      } catch {
        // Network error: keep cached identity if any, otherwise mark guest.
        if (!cached) setUserType('guest')
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [applyMeResponse])

  // The realtime token and the request draft belong to whoever was signed in.
  // When that user changes or ends in this tab — a guest merged into an
  // account, a logout, a different login, a session the server no longer
  // honours — both go: the cached token would keep presenting the previous
  // identity to AppSync (every channel the new user opens refused until it
  // expired), and a draft left on a shared device would greet the next person.
  //
  // Keyed on a previous identity having existed. `clearAuth` alone cannot be
  // the trigger: it also runs on every page load of an anonymous visitor
  // (/api/auth/me answers 401), and wiping the draft there would empty the
  // request funnel between its steps.
  const signedInAs = client?.id ?? garage?.id ?? null
  const previousIdentity = useRef<string | null>(null)
  useEffect(() => {
    const previous = previousIdentity.current
    previousIdentity.current = signedInAs
    if (!previous || previous === signedInAs) return
    appSyncService.resetIdentity()
    clearFormData()
  }, [signedInAs])

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
        isVerified,
        setClient,
        setGarage,
        logout,
        refreshClient,
        refreshGarage,
        syncSession
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
