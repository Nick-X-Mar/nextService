'use client'

import Image from 'next/image'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'

const socialLinks = [
  { icon: 'mail', label: 'Email', href: 'mailto:info@nextservice.gr' },
  { icon: 'facebook', label: 'Facebook', href: 'https://facebook.com/nextservice.gr', isBrand: true },
  { icon: 'share', label: 'Share', href: '#share' },
]

const footerLinks = [
  { label: 'Σχετικά', href: '/about' },
  { label: 'Όροι Χρήσης', href: '/terms' },
  { label: 'Πολιτική Απορρήτου', href: '/privacy' },
  { label: 'Επικοινωνία', href: '/contact' },
]

export default function Footer() {
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'NextService',
          text: 'Βρες τον καλύτερο συνεργείο για το αυτοκίνητό σου!',
          url: window.location.origin,
        })
      } catch {
        // User cancelled share
      }
    }
  }

  return (
    <footer className="bg-surface-container-highest border-t border-outline-variant/30 text-on-surface">
      <div className="max-w-7xl mx-auto px-5 py-10">
        {/* Top: Logo + Description */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-8">
          <Link href="/" className="shrink-0">
            <Image
              src="/logo.png"
              alt="NextService"
              width={120}
              height={40}
              className="h-10 w-auto"
            />
          </Link>
          <p className="text-sm text-on-surface-variant text-center md:text-left max-w-lg leading-relaxed">
            Η πλατφόρμα που συνδέει ιδιοκτήτες οχημάτων με αξιόπιστα συνεργεία.
            Βρες τον κατάλληλο επαγγελματία για το αυτοκίνητό σου, γρήγορα και εύκολα.
          </p>
        </div>

        {/* Divider */}
        <div className="border-b border-outline-variant/20 mb-8" />

        {/* Middle: Links + Social */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
          {/* Navigation Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {footerLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Social Links */}
          <div className="flex items-center gap-3">
            {socialLinks.map((social) => (
              <button
                key={social.label}
                onClick={social.href === '#share' ? handleShare : undefined}
                className="w-10 h-10 rounded-full border border-outline-variant/30 flex items-center justify-center hover:bg-surface-container-high transition-colors group"
                aria-label={social.label}
              >
                {social.href === '#share' ? (
                  <Icon name="share" size="sm" className="text-on-surface-variant group-hover:text-primary transition-colors" />
                ) : social.isBrand ? (
                  <Link href={social.href} target="_blank" rel="noreferrer" className="flex items-center justify-center">
                    <svg className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </Link>
                ) : (
                  <Link href={social.href} className="flex items-center justify-center">
                    <Icon name={social.icon} size="sm" className="text-on-surface-variant group-hover:text-primary transition-colors" />
                  </Link>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom: Copyright */}
        <div className="border-t border-outline-variant/20 pt-6">
          <p className="text-xs text-on-surface-variant/60 text-center">
            &copy; {new Date().getFullYear()} NextService. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
