'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { HiHome, HiChatBubbleLeftRight, HiUser, HiCalendar, HiCog6Tooth, HiPlusCircle } from 'react-icons/hi2'
import { styles } from '../styles/styles'

interface ClientNavigationProps {
  clientId: string
}

export default function ClientNavigation({ clientId }: ClientNavigationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const isRequestsTabActive = (tab: 'open' | 'appointment') => {
    if (pathname !== `/requests/${clientId}`) return false

    if (tab === 'appointment') {
      return tabParam === 'appointment'
    }

    // Default to "Αιτήματα" when no specific appointment tab is selected
    return tabParam !== 'appointment'
  }

  const navItems = [
    {
      href: '/',
      label: 'Νεο Αίτημα',
      icon: HiPlusCircle,
      active: pathname === '/'
    },
    {
      href: `/requests/${clientId}`,
      label: 'Αιτήματα',
      icon: HiHome,
      active: isRequestsTabActive('open')
    },
    {
      href: `/requests/${clientId}?tab=appointment`,
      label: 'Ραντεβού',
      icon: HiCalendar,
      active: isRequestsTabActive('appointment')
    },
    {
      href: `/requests/${clientId}/chats`,
      label: 'Συνομιλίες',
      icon: HiChatBubbleLeftRight,
      active: pathname === `/requests/${clientId}/chats`
    },
    {
      href: `/profile/${clientId}`,
      label: 'Προφίλ',
      icon: HiCog6Tooth,
      active: pathname === `/profile/${clientId}`
    }
  ]

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className={`${styles.container} py-4`}>
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <HiUser className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">NextService</h1>
              <p className="text-xs text-gray-500">Πελάτης</p>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    item.active
                      ? 'bg-orange-100 text-orange-700 border border-orange-200'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
