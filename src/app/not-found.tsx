import Link from 'next/link'
import Icon from '@/components/ui/Icon'

/**
 * Every unknown URL, and every `notFound()` without a closer not-found of its
 * own (e.g. /location/<unknown>/). Without it Next served its default English
 * page — "404: This page could not be found." — on a Greek site.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 px-5 text-center">
      <Icon name="search_off" size="xl" className="text-on-surface-variant/30" />
      <h1 className="text-xl font-bold text-on-surface">Η σελίδα δεν βρέθηκε</h1>
      <p className="text-sm text-on-surface-variant">
        Ο σύνδεσμος μπορεί να είναι λάθος ή η σελίδα να έχει μετακινηθεί.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full machined-gradient text-on-primary px-5 py-2.5 text-sm font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform"
      >
        <Icon name="home" size="sm" />
        Αρχική σελίδα
      </Link>
    </div>
  )
}
