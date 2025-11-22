'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from './AuthContext'

interface User {
  id: string
  firstName: string
  lastName?: string
  email?: string
  phoneNumber?: string
  isRegistered: boolean
}

interface UserContextType {
  user: User | null
  isLoading: boolean
  setUser: (user: User | null) => void
  refreshUser: (clientId: string) => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const { client, isLoading: authLoading, refreshClient } = useAuth()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Sync with AuthContext client data
  useEffect(() => {
    if (client) {
      const userData: User = {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phoneNumber: client.phoneNumber,
        isRegistered: client.isRegistered
      }
      setUser(userData)
    } else {
      setUser(null)
    }
    setIsLoading(authLoading)
  }, [client, authLoading])

  const refreshUser = async (clientId: string) => {
    try {
      console.log('UserContext: Refreshing user with clientId:', clientId)
      // Use AuthContext to refresh, which will update both contexts
      await refreshClient(clientId)
    } catch (error) {
      console.error('UserContext: Error refreshing user:', error)
      setUser(null)
    }
  }

  return (
    <UserContext.Provider value={{ user, isLoading, setUser, refreshUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}

