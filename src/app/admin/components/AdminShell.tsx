'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
import AdminTopBar from './AdminTopBar'
import SystemHealthBanner from './SystemHealthBanner'
import AdminAlertsBanner from './AdminAlertsBanner'

const COLLAPSED_KEY = 'ns-admin-menu-collapsed'

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
  // Phones: a drawer, closed until the menu button opens it. From lg up the
  // menu sits beside the page and the same button folds it away, remembered
  // per browser.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1')
    } catch { /* storage blocked: start expanded */ }
  }, [])

  // A tap on a menu link navigates; the drawer must not stay over the new page.
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const toggleMenu = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((was) => {
        try { localStorage.setItem(COLLAPSED_KEY, was ? '0' : '1') } catch { /* not remembered */ }
        return !was
      })
    } else {
      setDrawerOpen((open) => !open)
    }
  }

  // Skip auth check on login page (next.config has trailingSlash: true,
  // so usePathname returns '/admin/login/' — match both forms).
  const isLoginPage = pathname === '/admin/login' || pathname === '/admin/login/'

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false)
      return
    }

    async function checkAuth() {
      try {
        const res = await fetch('/api/admin/auth/me/')
        if (!res.ok) {
          router.push('/admin/login/')
          return
        }
        const data = await res.json()
        setAdmin(data)
      } catch {
        router.push('/admin/login/')
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
      <AdminSidebar open={drawerOpen} collapsed={collapsed} onClose={() => setDrawerOpen(false)} />
      <div className={`min-w-0 transition-[margin] duration-200 ${collapsed ? 'lg:ml-0' : 'lg:ml-60'}`}>
        <AdminTopBar adminEmail={admin?.email} onToggleMenu={toggleMenu} />
        <SystemHealthBanner />
        <AdminAlertsBanner />
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
