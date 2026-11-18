import type { Metadata } from 'next'
import Image from 'next/image'
import { SITE_URL } from '@/lib/site-url'
import Icon from '@/components/ui/Icon'
import { styles } from '@/styles/styles'
import InstallApp from './components/InstallApp'

const URL = `${SITE_URL}/app/`

export const metadata: Metadata = {
  title: 'Η εφαρμογή NextService',
  description: 'Βάλε το NextService στο κινητό ή στον υπολογιστή σου: μένεις συνδεδεμένος και σε ειδοποιούμε για προσφορές και μηνύματα. Δωρεάν, χωρίς App Store.',
  alternates: { canonical: URL },
}

const BENEFITS = [
  { icon: 'notifications_active', title: 'Ειδοποιήσεις', detail: 'Για κάθε νέα προσφορά και κάθε μήνυμα από τα συνεργεία, ακόμα κι όταν είναι κλειστή.' },
  { icon: 'lock', title: 'Μένεις συνδεδεμένος', detail: 'Όσο την ανοίγεις, έστω κάθε τρεις μέρες, δεν σου ζητάει ξανά κωδικό.' },
  { icon: 'touch_app', title: 'Ένα πάτημα', detail: 'Ανοίγει από την οθόνη σου, σε όλη την οθόνη, σαν κάθε εφαρμογή.' },
  { icon: 'desktop_windows', title: 'Και στον υπολογιστή', detail: 'Σε Chrome, Edge ή Safari, με τις ίδιες ειδοποιήσεις.' },
]

/**
 * How to put the site on a phone or computer as an app (src/app/manifest.ts),
 * for whichever browser opened it, and the switch for its notifications. A
 * link to share: nextservice.gr/app/.
 */
export default function AppPage() {
  return (
    <div className={`${styles.pageWrapper} pb-24 md:pb-16`}>
      <div className="max-w-3xl mx-auto px-5 md:px-8 pt-8 space-y-6">
        <header className="flex flex-col items-center text-center gap-4">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={88}
            height={88}
            className="rounded-2xl shadow-lg shadow-on-surface/10"
            priority
          />
          <div className="space-y-2">
            <p className={styles.labelPrimary}>Δωρεάν · χωρίς App Store</p>
            <h1 className="text-3xl font-black tracking-tight text-on-surface sm:text-4xl">
              Το NextService <span className={styles.titleHighlight}>σαν εφαρμογή</span>
            </h1>
            <p className={`${styles.bodyText} max-w-xl`}>
              Βάλ&apos; το στην οθόνη του κινητού ή του υπολογιστή σου και άνοιξέ το με ένα πάτημα.
            </p>
          </div>
        </header>

        <InstallApp />

        <section className="grid gap-3 sm:grid-cols-2" aria-label="Τι κερδίζεις">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="flex items-start gap-3 rounded-xl bg-surface-container-low p-4">
              <Icon name={benefit.icon} filled className="text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-on-surface">{benefit.title}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{benefit.detail}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
