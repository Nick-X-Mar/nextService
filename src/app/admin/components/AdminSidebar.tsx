'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const navItems = [
  { icon: 'dashboard', label: 'Dashboard', href: '/admin/dashboard' },
  { icon: 'local_offer', label: 'Hot Deals', href: '/admin/hot-deals' },
  { icon: 'article', label: 'Content', href: '/admin/content' },
  { icon: 'mail', label: 'Emails', href: '/admin/emails' },
  { icon: 'error', label: 'Errors', href: '/admin/errors' },
  { icon: 'people', label: 'Users', href: '/admin/users' },
  { icon: 'garage', label: 'Garages', href: '/admin/garages', badgeKey: 'pendingGarages' as const },
  { icon: 'build', label: 'Requests', href: '/admin/requests' },
  { icon: 'star', label: 'Reviews', href: '/admin/reviews' },
  { icon: 'new_releases', label: 'Custom Vehicles', href: '/admin/custom-vehicles', badgeKey: 'customVehicles' as const },
  { icon: 'payments', label: 'Payments', href: '/admin/payments' },
  { icon: 'account_balance_wallet', label: 'Commissions', href: '/admin/commissions' },
  { icon: 'settings', label: 'Settings', href: '/admin/settings' },
  { icon: 'monitoring', label: 'Performance', href: '/admin/performance' },
  { icon: 'analytics', label: 'Funnel', href: '/admin/funnel' },
  { icon: 'science', label: 'E2E Tests', href: '/admin/tests' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const [customVehicleCount, setCustomVehicleCount] = useState(0)
  const [pendingGarageCount, setPendingGarageCount] = useState(0)

  useEffect(() => {
    fetch('/api/admin/custom-vehicles/')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.total) setCustomVehicleCount(data.total) })
      .catch(() => {})

    fetch('/api/admin/users/garages/?limit=1&status=pending')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (typeof data?.total === 'number') setPendingGarageCount(data.total) })
      .catch(() => {})
  }, [])

  return (
    <aside className="fixed top-0 left-0 h-full w-60 bg-inverse-surface text-inverse-on-surface flex flex-col z-40">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-white/10">
        <Image src="/images/next_logo.svg" alt="NextService" width={100} height={80} className="h-7 w-auto brightness-0 invert" />
        <span className="ml-2 text-xs font-medium bg-inverse-primary/20 text-inverse-primary px-2 py-0.5 rounded-full">
          Admin
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-inverse-primary/15 text-inverse-primary'
                  : 'text-inverse-on-surface/70 hover:bg-white/5 hover:text-inverse-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
              {'badgeKey' in item && item.badgeKey === 'customVehicles' && customVehicleCount > 0 && (
                <span className="ml-auto bg-tertiary text-on-tertiary text-[10px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5">
                  {customVehicleCount}
                </span>
              )}
              {'badgeKey' in item && item.badgeKey === 'pendingGarages' && pendingGarageCount > 0 && (
                <span className="ml-auto bg-tertiary text-on-tertiary text-[10px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5">
                  {pendingGarageCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/10 text-xs text-inverse-on-surface/50">
        NextService Admin v1.0
      </div>
    </aside>
  )
}
