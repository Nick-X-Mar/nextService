'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Spinner from '@/components/Spinner'

interface AdminTopBarProps {
  adminEmail?: string
  adminName?: string
}

export default function AdminTopBar({ adminEmail, adminName }: AdminTopBarProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/admin/auth/logout/', { method: 'POST' })
      router.push('/admin/login/')
    } catch {
      setLoggingOut(false)
    }
  }

  return (
    <header className="h-14 bg-surface-container-lowest border-b border-outline-variant/30 flex items-center justify-between px-6 sticky top-0 z-30">
      <div />

      <div className="flex items-center gap-4">
        <span className="text-sm text-on-surface/70">
          {adminName || adminEmail || 'Admin'}
        </span>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 text-sm text-on-surface/60 hover:text-tertiary transition-colors disabled:opacity-50"
        >
          {loggingOut
            ? <Spinner size="sm" />
            : <span className="material-symbols-outlined text-[18px]">logout</span>}
          {loggingOut ? 'Logging out…' : 'Logout'}
        </button>
      </div>
    </header>
  )
}
