'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { icon: 'dashboard', label: 'Dashboard', href: '/admin/dashboard' },
  { icon: 'mail', label: 'Emails', href: '/admin/emails' },
  { icon: 'error', label: 'Errors', href: '/admin/errors' },
  { icon: 'people', label: 'Users', href: '/admin/users' },
  { icon: 'build', label: 'Requests', href: '/admin/requests' },
  { icon: 'payments', label: 'Payments', href: '/admin/payments' },
  { icon: 'settings', label: 'Settings', href: '/admin/settings' },
]

export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed top-0 left-0 h-full w-60 bg-inverse-surface text-inverse-on-surface flex flex-col z-40">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-white/10">
        <span className="text-inverse-primary font-headline font-bold text-lg">
          NextService
        </span>
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
