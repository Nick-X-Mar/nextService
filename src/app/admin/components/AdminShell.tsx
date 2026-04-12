'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
import AdminTopBar from './AdminTopBar'

interface AdminInfo {
  adminId: string
  email: string
  role: string
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // Skip auth check on login page
  const isLoginPage = pathname === '/admin/login'

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false)
      return
    }

    async function checkAuth() {
      try {
        const res = await fetch('/api/admin/auth/me')
        if (!res.ok) {
          router.push('/admin/login')
          return
        }
        const data = await res.json()
        setAdmin(data)
      } catch {
        router.push('/admin/login')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [isLoginPage, router])

  // Login page renders without shell
  if (isLoginPage) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <AdminSidebar />
      <div className="ml-60">
        <AdminTopBar adminEmail={admin?.email} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
