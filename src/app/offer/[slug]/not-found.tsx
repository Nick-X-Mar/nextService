import Link from 'next/link'
import Icon from '@/components/ui/Icon'

export default function OfferNotFound() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 px-5 text-center">
      <Icon name="search_off" size="xl" className="text-on-surface-variant/30" />
      <h1 className="text-xl font-bold text-on-surface">Η εργασία δεν βρέθηκε</h1>
      <p className="text-sm text-on-surface-variant">
        Μπορεί να έχει αφαιρεθεί. Δες τις υπόλοιπες ολοκληρωμένες εργασίες ή στείλε το δικό σου αίτημα.
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
