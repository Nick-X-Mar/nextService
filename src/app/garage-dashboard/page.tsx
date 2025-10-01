'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    // Get garage ID from localStorage and redirect to the new URL structure
    const garageId = localStorage.getItem('garageId')
    if (garageId) {
      router.replace(`/garage-dashboard/${garageId}`)
    } else {
      router.replace('/login')
    }
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Ανακατεύθυνση...</p>
      </div>
    </div>
  )
}
