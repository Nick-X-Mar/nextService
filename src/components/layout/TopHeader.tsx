'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Icon from '@/components/ui/Icon'
import ServiceCategoryModal from '@/components/ServiceCategoryModal'

export default function TopHeader() {
  const { userType, client, garage, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const pathname = usePathname()

  const isLanding = pathname === '/'

  const displayName = userType === 'garage'
    ? garage?.companyName
    : client?.firstName || null

  return (
    <header className={`w-full z-50 ${isLanding ? 'absolute top-0 bg-transparent' : 'sticky top-0 bg-surface/80 backdrop-blur-xl shadow-sm'}`}>
      <div className="flex items-center justify-between px-5 md:px-6 h-16 max-w-screen-2xl mx-auto">
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-2 rounded-full hover:bg-surface-container transition-colors active:scale-95"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} className={isLanding ? 'text-white' : 'text-on-surface'} />
          </button>
          <Link href={userType === 'garage' && garage ? `/garage-dashboard/${garage.id}` : '/'} className="flex items-center">
            <Image
              src="/logo.png"
              alt="NextService"
              width={120}
              height={40}
              className="h-8 w-auto"
            />
          </Link>
        </div>

        {/* Center: Desktop nav links */}
        <nav className="hidden md:flex items-center gap-8 font-body text-sm font-medium">
          {/* Guests still see Αρχική + Επαγγελματίες links */}
          {(!userType || userType === 'guest') && (
            <>
              <Link href="/" className={`${isLanding ? 'text-white/80 hover:text-white' : 'text-secondary hover:text-on-surface'} transition-colors`}>
                Αρχική
              </Link>
              <Link href="/register-professional" className={`${isLanding ? 'text-white/80 hover:text-white' : 'text-secondary hover:text-on-surface'} transition-colors`}>
                Επαγγελματίες
              </Link>
            </>
          )}
          {/* Logged-in clients see ONLY the "Νέο Αίτημα" CTA — every other
              navigation item lives in the sidebar / bottom nav. */}
          {userType === 'client' && client && (
            <button
              onClick={() => setCategoryModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-primary to-primary-container text-on-primary text-sm font-bold shadow-md active:scale-95 transition-all"
            >
              <Icon name="add_circle" size="sm" filled />
              Νέο Αίτημα
            </button>
          )}
          {userType === 'garage' && garage && (
            <Link href={`/garage-dashboard/${garage.id}`} className="text-secondary hover:text-on-surface transition-colors">
              Dashboard
            </Link>
          )}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {!userType || userType === 'guest' ? (
            <>
              <Link
                href="/login"
                className={`px-5 py-2 rounded-lg text-sm font-bold active:scale-95 transition-all ${isLanding ? 'bg-white/20 backdrop-blur-sm text-white border border-white/30 hover:bg-white/30' : 'bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-md'}`}
              >
                Σύνδεση
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {displayName && (
                <span className="hidden md:block text-sm font-bold text-on-surface truncate max-w-[150px]">
                  {displayName}
                </span>
              )}
              <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center overflow-hidden border border-outline-variant/20">
                {userType === 'client' && client ? (
                  <Link href={`/profile/${client.id}`}>
                    <span className="text-sm font-bold text-primary">
                      {client.firstName?.charAt(0).toUpperCase()}
                    </span>
                  </Link>
                ) : (
                  <Icon name="account_circle" className="text-primary" />
                )}
              </div>
              <button
                onClick={logout}
                className="hidden md:flex items-center gap-1 text-sm text-secondary hover:text-tertiary transition-colors"
              >
                <Icon name="logout" size="sm" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-surface border-t border-outline-variant/20 px-5 py-4 space-y-2">
          {(!userType || userType === 'guest') && (
            <>
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container transition-colors">
                <Icon name="home" className="text-primary" />
                <span className="font-medium">Αρχική</span>
              </Link>
              <Link href="/register-professional" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container transition-colors">
                <Icon name="handyman" className="text-primary" />
                <span className="font-medium">Εγγραφή Επαγγελματία</span>
              </Link>
            </>
          )}
          {userType === 'client' && client && (
            <button onClick={() => { setMobileMenuOpen(false); setCategoryModalOpen(true) }} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container transition-colors w-full">
              <Icon name="add_circle" className="text-primary" filled />
              <span className="font-medium">Νέο Αίτημα</span>
            </button>
          )}
          {userType === 'garage' && garage && (
            <Link href={`/garage-dashboard/${garage.id}`} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container transition-colors">
              <Icon name="dashboard" className="text-primary" />
              <span className="font-medium">Dashboard</span>
            </Link>
          )}
          {userType && userType !== 'guest' && (
            <button onClick={() => { logout(); setMobileMenuOpen(false) }} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container transition-colors w-full text-tertiary">
              <Icon name="logout" className="text-tertiary" />
              <span className="font-medium">Αποσύνδεση</span>
            </button>
          )}
        </div>
      )}
      <ServiceCategoryModal isOpen={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} />
    </header>
  )
}
