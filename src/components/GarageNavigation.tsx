'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { HiHome, HiChatBubbleLeftRight, HiWrenchScrewdriver, HiCalendar, HiCog6Tooth, HiDocumentText } from 'react-icons/hi2'
import { styles } from '../styles/styles'

interface GarageNavigationProps {
  garageId: string
  companyName?: string
}

export default function GarageNavigation({ garageId, companyName }: GarageNavigationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const isTabActive = (tab: 'requests' | 'offers' | 'appointments' | 'settings') => {
    if (pathname !== `/garage-dashboard/${garageId}`) return false
    return tabParam === tab
  }

  const navItems = [
    {
      href: `/garage-dashboard/${garageId}?tab=requests`,
      label: 'Νέα Αιτήματα',
      icon: HiHome,
      active: isTabActive('requests') || (pathname === `/garage-dashboard/${garageId}` && !tabParam)
    },
    {
      href: `/garage-dashboard/${garageId}?tab=offers`,
      label: 'Προσφορές από Εμένα',
      icon: HiDocumentText,
      active: isTabActive('offers')
    },
    {
      href: `/garage-dashboard/${garageId}?tab=appointments`,
      label: 'Ραντεβού',
      icon: HiCalendar,
      active: isTabActive('appointments')
    },
    {
      href: `/garage-dashboard/${garageId}/chats`,
      label: 'Ανοιχτές Συνομιλίες',
      icon: HiChatBubbleLeftRight,
      active: pathname === `/garage-dashboard/${garageId}/chats`
    },
    {
      href: `/garage-dashboard/${garageId}/chats/appointments`,
      label: 'Συνομιλίες με Επερχόμενα Ραντεβού',
      icon: HiChatBubbleLeftRight,
      active: pathname === `/garage-dashboard/${garageId}/chats/appointments`
    },
    {
      href: `/garage-dashboard/${garageId}?tab=settings`,
      label: 'Ρυθμίσεις Συνεργείου',
      icon: HiCog6Tooth,
      active: isTabActive('settings')
    }
  ]

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className={`${styles.container} py-4`}>
        <div className="flex items-center justify-between gap-4">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <HiWrenchScrewdriver className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {companyName || 'NextService'}
              </h1>
              <p className="text-xs text-gray-500">Συνεργείο</p>
            </div>
          </div>

          {/* Navigation Links - Max 50% width, right side */}
          <div className="flex items-center gap-1 flex-wrap max-w-[50%] justify-end">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
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

