'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { HiUserPlus, HiArrowRightOnRectangle, HiBars3, HiUser, HiCog6Tooth } from 'react-icons/hi2'
import { styles } from '../styles/styles'
import { useUser } from '../contexts/UserContext'

interface GarageData {
  id: string
  companyName: string
  email: string
  mobile: string
  address: string
  tin: string
  taxAuthority: string
  description?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function Header() {
  const { user, isLoading } = useUser()
  const router = useRouter()
  const [garageData, setGarageData] = useState<GarageData | null>(null)
  const [garageLoading, setGarageLoading] = useState(true)
  
  // Check for garage authentication
  useEffect(() => {
    const garageId = localStorage.getItem('garageId')
    if (garageId) {
      // Load garage data
      fetch(`/api/garage/${garageId}`)
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            setGarageData(data.garage)
          } else {
            setGarageData(null)
          }
        })
        .catch(error => {
          console.error('Error loading garage data:', error)
          setGarageData(null)
        })
        .finally(() => {
          setGarageLoading(false)
        })
    } else {
      setGarageLoading(false)
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('clientId')
    localStorage.removeItem('garageId')
    router.push('/')
    // Refresh the page to clear user context
    window.location.reload()
  }

  const handleGarageLogout = () => {
    localStorage.removeItem('garageId')
    router.push('/')
    // Refresh the page to clear garage context
    window.location.reload()
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className={styles.container}>
        <div className={`${styles.flexBetween} h-16`}>
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center">
              <div className={`bg-orange-400 text-white font-bold text-xl px-3 py-2 rounded-lg`}>
                NextService
              </div>
            </Link>
          </div>

          {/* Navigation Menu */}
          <nav className="hidden md:flex items-center space-x-8">
            {!garageLoading && garageData ? (
              // Garage is logged in - show garage info
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <HiUser className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">
                    {garageData.companyName}
                  </span>
                </div>
                <button
                  onClick={handleGarageLogout}
                  className="text-gray-700 hover:text-orange-500 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                >
                  <HiArrowRightOnRectangle className="h-4 w-4" />
                  Αποσύνδεση
                </button>
              </div>
            ) : !isLoading && user?.isRegistered ? (
              // Client is logged in - show user info
              <div className="flex items-center gap-3">
                <Link 
                  href={`/requests/${user.id}`}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                >
                  <HiUser className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">
                    {user.firstName}
                  </span>
                </Link>
                <Link 
                  href={`/requests/${user.id}`}
                  className={styles.navLink}
                >
                  <HiCog6Tooth className="h-4 w-4" />
                  Προφίλ
                </Link>
                <Link 
                  href="/register-professional" 
                  className={styles.navLink}
                >
                  <HiUserPlus className="h-4 w-4" />
                  Εγγραφή Επαγγελματία
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-gray-700 hover:text-orange-500 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                >
                  <HiArrowRightOnRectangle className="h-4 w-4" />
                  Αποσύνδεση
                </button>
              </div>
            ) : (
              // No one is logged in - show login/register options
              <>
                <Link 
                  href="/register-professional" 
                  className={styles.navLink}
                >
                  <HiUserPlus className="h-4 w-4" />
                  Εγγραφή Επαγγελματία
                </Link>
                <Link 
                  href="/login" 
                  className={styles.navButton}
                >
                  <HiArrowRightOnRectangle className="h-4 w-4" />
                  Σύνδεση
                </Link>
              </>
            )}
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className={styles.mobileMenuButton}
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              <HiBars3 className="block h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Mobile menu, show/hide based on menu state */}
        <div className={styles.mobileMenu}>
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200 mt-2">
            {!garageLoading && garageData ? (
              // Garage is logged in - show garage info
              <div className="px-3 py-2 mb-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <HiUser className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">
                    {garageData.companyName}
                  </span>
                </div>
                <button
                  onClick={handleGarageLogout}
                  className="mt-2 w-full text-gray-700 hover:text-orange-500 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
                >
                  <HiArrowRightOnRectangle className="h-4 w-4" />
                  Αποσύνδεση
                </button>
              </div>
            ) : !isLoading && user?.isRegistered ? (
              // Client is logged in - show user info
              <div className="px-3 py-2 mb-2">
                <Link 
                  href={`/requests/${user.id}`}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                >
                  <HiUser className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">
                    {user.firstName}
                  </span>
                </Link>
                <Link
                  href={`/requests/${user.id}`}
                  className="mt-2 w-full text-gray-700 hover:text-orange-500 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
                >
                  <HiCog6Tooth className="h-4 w-4" />
                  Προφίλ
                </Link>
                <button
                  onClick={handleLogout}
                  className="mt-2 w-full text-gray-700 hover:text-orange-500 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
                >
                  <HiArrowRightOnRectangle className="h-4 w-4" />
                  Αποσύνδεση
                </button>
              </div>
            ) : null}
            <Link
              href="/register-professional"
              className={styles.mobileNavLink}
            >
              <HiUserPlus className="h-4 w-4" />
              Εγγραφή Επαγγελματία
            </Link>
            {!garageLoading && !garageData && !isLoading && !user?.isRegistered && (
              <Link
                href="/login"
                className={`${styles.btnPrimary} block text-base`}
              >
                <HiArrowRightOnRectangle className="h-4 w-4" />
                Σύνδεση
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
} 