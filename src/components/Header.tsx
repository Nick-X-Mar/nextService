import Link from 'next/link'
import { HiUserPlus, HiArrowRightOnRectangle, HiBars3 } from 'react-icons/hi2'
import { styles } from '../styles/styles'

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className={styles.container}>
        <div className={`${styles.flexBetween} h-16`}>
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center">
              <div className="bg-blue-600 text-white font-bold text-xl px-3 py-2 rounded-lg">
                NextService
              </div>
            </Link>
          </div>

          {/* Navigation Menu */}
          <nav className="hidden md:flex items-center space-x-8">
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
            <Link
              href="/register-professional"
              className={styles.mobileNavLink}
            >
              <HiUserPlus className="h-4 w-4" />
              Εγγραφή Επαγγελματία
            </Link>
            <Link
              href="/login"
              className={`${styles.btnPrimary} block text-base`}
            >
              <HiArrowRightOnRectangle className="h-4 w-4" />
              Σύνδεση
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
} 