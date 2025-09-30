'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

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
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = async (clientId: string) => {
    try {
      console.log('UserContext: Refreshing user with clientId:', clientId)
      const response = await fetch(`/api/clients/${clientId}`)
      if (response.ok) {
        const data = await response.json()
        const client = data.client
        
        console.log('UserContext: Received client data:', client)
        
        if (client) {
          const userData = {
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phoneNumber: client.phoneNumber,
            isRegistered: !!client.email
          }
          console.log('UserContext: Setting user data:', userData)
          setUser(userData)
        } else {
          console.log('UserContext: No client data, setting user to null')
          setUser(null)
        }
      } else {
        console.log('UserContext: Response not ok, setting user to null')
        setUser(null)
      }
    } catch (error) {
      console.error('UserContext: Error fetching user:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Check for clientId in localStorage on mount
  useEffect(() => {
    const clientId = localStorage.getItem('clientId')
    if (clientId) {
      refreshUser(clientId)
    } else {
      setIsLoading(false)
    }
  }, [])

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
