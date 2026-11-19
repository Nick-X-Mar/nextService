'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Button from '@/components/Button'
import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import PushNotificationsSetting from '@/components/PushNotificationsSetting'
import { useAuth } from '@/contexts/AuthContext'
import { installRoute, promptInstall, watchInstall, type InstallRoute } from '@/lib/pwa'
import { styles } from '@/styles/styles'

const inline = (name: string) => (
  <Icon name={name} size="sm" className="text-primary align-[-3px] mx-0.5" />
)

/** The browser's own steps, where it has no one-tap offer (see installRoute). */
const STEPS: Partial<Record<InstallRoute, { title: string; steps: ReactNode[]; note?: string }>> = {
  ios: {
    title: 'Στο iPhone ή στο iPad',
    steps: [
      <>Πάτα το κουμπί Κοινοποίησης {inline('ios_share')}. Στο Safari, αν δεν το βλέπεις, πάτα πρώτα το {inline('more_horiz')}.</>,
      <>Διάλεξε «Προσθήκη στην οθόνη Αφετηρίας» {inline('add_box')}. Αν δεν φαίνεται, σύρε τη λίστα προς τα πάνω.</>,
      <>Πάτα «Προσθήκη». Το NextService μπαίνει στην οθόνη σου.</>,
    ],
    note: 'Άνοιξέ το από το εικονίδιο και συνδέσου μία φορά εκεί. Στο iPhone οι ειδοποιήσεις έρχονται μόνο στην εφαρμογή.',
  },
  'android-menu': {
    title: 'Στο κινητό σου',
    steps: [
      <>Πάτα το μενού του browser {inline('more_vert')}, πάνω δεξιά.</>,
      <>Διάλεξε «Εγκατάσταση εφαρμογής» ή «Προσθήκη στην αρχική οθόνη».</>,
      <>Επιβεβαίωσε με «Εγκατάσταση». Το NextService μπαίνει στην οθόνη σου.</>,
    ],
  },
  'desktop-menu': {
    title: 'Στον υπολογιστή σου',
    steps: [
      <>Πάτα το εικονίδιο εγκατάστασης {inline('install_desktop')} στη γραμμή διευθύνσεων, δεξιά.</>,
      <>Αν δεν το βλέπεις, άνοιξε το μενού {inline('more_vert')} και διάλεξε την εγκατάσταση του NextService.</>,
    ],
  },
  'mac-safari': {
    title: 'Στο Mac σου',
    steps: [
      <>Από το μενού «Αρχείο» του Safari, διάλεξε «Προσθήκη στο Dock».</>,
      <>Πάτα «Προσθήκη». Το NextService ανοίγει από το Dock σαν εφαρμογή.</>,
    ],
  },
}

/**
 * The /app/ page's working part: the one-tap install where the browser
 * offers it, its own steps where it does not, and this device's
 * notifications for whoever is signed in.
 */
export default function InstallApp() {
  const { isVerified, userType } = useAuth()
  const [route, setRoute] = useState<InstallRoute | null>(null)
  const [justInstalled, setJustInstalled] = useState(false)

  useEffect(() => {
    const update = () => setRoute(installRoute())
    update()
    return watchInstall(update)
  }, [])

  const install = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') setJustInstalled(true)
    // The offer is used up either way; what is left is the browser's menu.
    setRoute(installRoute())
  }

  const signedIn = userType === 'client' || userType === 'garage'
  const guide = route ? STEPS[route] : undefined

  return (
    <>
      <article className={styles.card} aria-label="Εγκατάσταση">
        {route === null ? (
          <div className="flex justify-center py-6"><Spinner size="md" className="text-primary" /></div>
        ) : route === 'installed' || justInstalled ? (
          <div className="flex items-start gap-3">
            <Icon name="check_circle" filled size="lg" className="text-primary flex-shrink-0" />
            <div>
              <h2 className={styles.cardTitle}>
                {justInstalled ? 'Έτοιμο, το NextService είναι στην οθόνη σου' : 'Είσαι στην εφαρμογή NextService'}
              </h2>
              <p className={`${styles.smallText} mt-1`}>
                {justInstalled ? 'Από εδώ και πέρα, άνοιξέ το από εκεί.' : 'Από εδώ το ανοίγεις κάθε φορά, με ένα πάτημα.'}
              </p>
            </div>
          </div>
        ) : route === 'prompt' ? (
          <div className="space-y-4">
            <div>
              <h2 className={styles.cardTitle}>Εγκατάσταση με ένα πάτημα</h2>
              <p className={`${styles.smallText} mt-1`}>Μπαίνει στην οθόνη σου και ανοίγει σαν εφαρμογή.</p>
            </div>
            <Button variant="primary" size="lg" fullWidth onClick={install}>
              <Icon name="install_mobile" size="sm" />
              Εγκατάσταση
            </Button>
          </div>
        ) : guide ? (
          <div className="space-y-4">
            <h2 className={styles.cardTitle}>{guide.title}</h2>
            <ol className="space-y-3">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="h-7 w-7 flex-shrink-0 rounded-full bg-primary/10 text-primary text-sm font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                  <p className="text-sm text-on-surface pt-1 leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
            {guide.note && <p className="text-xs text-on-surface-variant">{guide.note}</p>}
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Icon name="open_in_browser" size="lg" className="text-primary flex-shrink-0" />
            <div>
              <h2 className={styles.cardTitle}>Άνοιξέ το σε άλλον browser</h2>
              <p className={`${styles.smallText} mt-1`}>
                Από εδώ δεν μπαίνει σαν εφαρμογή. Άνοιξε το nextservice.gr/app σε Chrome, Edge ή Safari.
              </p>
            </div>
          </div>
        )}
      </article>

      <article className={styles.card} aria-label="Ειδοποιήσεις">
        <h2 className={`${styles.cardTitle} mb-4`}>Ειδοποιήσεις</h2>
        {!isVerified ? (
          <div className="flex justify-center py-2"><Spinner size="md" className="text-primary" /></div>
        ) : signedIn ? (
          <PushNotificationsSetting audience={userType === 'garage' ? 'garage' : 'client'} />
        ) : (
          <p className={styles.smallText}>
            <Link href="/login/?next=/app/" className={styles.linkText}>Συνδέσου</Link>
            {' '}για να ενεργοποιήσεις τις ειδοποιήσεις σε αυτή τη συσκευή.
          </p>
        )}
      </article>
    </>
  )
}
