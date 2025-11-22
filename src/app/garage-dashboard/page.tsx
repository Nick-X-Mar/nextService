'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Page() {
  const router = useRouter()
  const { userType, garage, isLoading } = useAuth()

  useEffect(() => {
    // Wait for auth to load
    if (isLoading) {
      return
    }

    // Check if user is authenticated as a garage
    if (userType === 'garage' && garage) {
      router.replace(`/garage-dashboard/${garage.id}`)
    } else {
      router.replace('/login')
    }
  }, [router, userType, garage, isLoading])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Ανακατεύθυνση...</p>
      </div>
    </div>
  )
}
