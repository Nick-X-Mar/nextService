import Link from 'next/link'
import { HiUserPlus, HiArrowRightOnRectangle, HiBars3 } from 'react-icons/hi2'

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
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
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <HiUserPlus className="h-4 w-4" />
              Εγγραφή Επαγγελματία
            </Link>
            <Link 
              href="/login" 
              className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <HiArrowRightOnRectangle className="h-4 w-4" />
              Σύνδεση
            </Link>
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className="bg-gray-100 inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              <HiBars3 className="block h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Mobile menu, show/hide based on menu state */}
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200 mt-2">
            <Link
              href="/register-professional"
              className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <HiUserPlus className="h-4 w-4" />
              Εγγραφή Επαγγελματία
            </Link>
            <Link
              href="/login"
              className="bg-blue-600 text-white hover:bg-blue-700 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200 flex items-center gap-2"
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