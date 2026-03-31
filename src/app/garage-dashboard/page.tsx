'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { styles } from '@/styles/styles'

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
    <div className={styles.pageCenter}>
      <div className="text-center">
        <div className={styles.loadingSpinner}></div>
        <p className={styles.bodyText}>Ανακατεύθυνση...</p>
      </div>
    </div>
  )
}
