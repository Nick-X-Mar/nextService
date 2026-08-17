import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { SITE_URL } from '@/lib/site-url'
import { ORGANIZATION_ID, breadcrumbJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'

const URL = `${SITE_URL}/about/`

const TITLE = 'Σχετικά με το NextService'
const DESCRIPTION =
  'Τι είναι το NextService, πώς λειτουργεί η πλατφόρμα συνεργείων αυτοκινήτου, πώς ελέγχονται τα συνεργεία και γιατί η υπηρεσία είναι δωρεάν για τους πελάτες.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    type: 'website',
    url: URL,
    siteName: 'NextService',
    locale: 'el_GR',
    title: `${TITLE} | NextService`,
    description: DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/opengraph-image/`,
        width: 1200,
        height: 630,
        alt: TITLE,
        type: 'image/png',
      },
    ],
  },
}

const aboutPageJsonLd = {
  '@type': 'AboutPage',
  '@id': `${URL}#aboutpage`,
  name: TITLE,
  description: DESCRIPTION,
  url: URL,
  inLanguage: 'el-GR',
  mainEntity: { '@id': ORGANIZATION_ID },
}

const steps = [
  {
    icon: 'edit_note',
    title: 'Στέλνεις το αίτημα',
    body: 'Συμπληρώνεις τα στοιχεία του οχήματος και περιγράφεις την εργασία ή το πρόβλημα. Μπορείς να ανεβάσεις και φωτογραφίες — βοηθούν το συνεργείο να δώσει ρεαλιστική τιμή από την αρχή.',
  },
  {
    icon: 'local_offer',
    title: 'Λαμβάνεις προσφορές',
    body: 'Συνεργεία της περιοχής σου που έχουν διαθεσιμότητα απαντούν με συγκεκριμένη τιμή, τι ανταλλακτικά θα χρησιμοποιήσουν και πότε μπορούν να σε δεχτούν.',
  },
  {
    icon: 'forum',
    title: 'Ρωτάς ό,τι θέλεις',
    body: 'Συνομιλείς απευθείας με κάθε συνεργείο μέσα από την πλατφόρμα, πριν δεσμευτείς σε οτιδήποτε.',
  },
  {
    icon: 'event_available',
    title: 'Κλείνεις ραντεβού',
    body: 'Διαλέγεις την προσφορά που σε καλύπτει και κλείνεις online. Η πληρωμή της εργασίας γίνεται απευθείας στο συνεργείο.',
  },
]

export default function AboutPage() {
  const crumbs = breadcrumbJsonLd([
    { name: 'Αρχική', url: `${SITE_URL}/` },
    { name: 'Σχετικά', url: URL },
  ])

  return (
    <>
      <script {...jsonLdScript(graphJsonLd([aboutPageJsonLd, crumbs]))} />

      <div className="min-h-screen bg-surface pb-16">
        <div className="max-w-3xl mx-auto px-5 md:px-8 pt-8">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              <li>
                <Link href="/" className="hover:text-primary transition-colors">
                  Αρχική
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-primary">Σχετικά</li>
            </ol>
          </nav>

          <header className="mb-10">
            <h1 className="text-4xl font-black tracking-tight text-on-surface sm:text-5xl">
              Σχετικά με το <span className="text-primary">NextService</span>
            </h1>
            <p className="mt-4 text-base text-secondary leading-relaxed">
              Το NextService είναι η πλατφόρμα που συνδέει ιδιοκτήτες οχημάτων με
              επαγγελματικά συνεργεία, ώστε η επιλογή να γίνεται με ανοιχτή σύγκριση τιμής,
              διαθεσιμότητας και ανταλλακτικών — και όχι με τηλέφωνα στην τύχη. Προς το
              παρόν συνεργαζόμαστε μόνο με συνεργεία στην Αθήνα.
            </p>
          </header>

          <section className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
              Το πρόβλημα που λύνουμε
            </h2>
            <p className="text-base text-secondary leading-relaxed">
              Για την ίδια ακριβώς εργασία, στο ίδιο μοντέλο, η τιμή ανάμεσα σε δύο
              συνεργεία λίγων χιλιομέτρων απόσταση μπορεί να διαφέρει σημαντικά. Ο
              ιδιοκτήτης σπάνια έχει τρόπο να το δει: θα έπρεπε να πάρει τηλέφωνο πολλά
              συνεργεία, να περιγράψει κάθε φορά το ίδιο πρόβλημα και να συγκρίνει
              απαντήσεις που δεν είναι καν στην ίδια βάση — άλλος δίνει τιμή με
              ανταλλακτικά, άλλος μόνο εργατικά.
            </p>
            <p className="mt-3 text-base text-secondary leading-relaxed">
              Το NextService αντιστρέφει τη ροή. Περιγράφεις μία φορά τι χρειάζεσαι, και τα
              συνεργεία έρχονται σε σένα με δομημένες προσφορές που συγκρίνονται μεταξύ
              τους.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
              Πώς λειτουργεί
            </h2>
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  className="flex gap-4 bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10"
                >
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-surface-container text-primary shrink-0">
                    <Icon name={s.icon} size="md" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-on-surface mb-1">
                      <span className="text-primary">{i + 1}.</span> {s.title}
                    </h3>
                    <p className="text-sm text-secondary leading-relaxed">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
              Πώς ελέγχουμε τα συνεργεία
            </h2>
            <p className="text-base text-secondary leading-relaxed">
              Κάθε συνεργείο εγγράφεται με ΑΦΜ, αρμόδια ΔΟΥ και στοιχεία επιχείρησης, τα
              οποία ελέγχονται πριν ενεργοποιηθεί ο λογαριασμός του. Οι όροι χρήσης
              δεσμεύουν τα συνεργεία να τηρούν τις τιμές που αναγράφουν στις προσφορές τους
              και να χρησιμοποιούν τα στοιχεία επικοινωνίας του πελάτη αποκλειστικά για το
              συγκεκριμένο αίτημα. Συνεργεία με επαναλαμβανόμενα παράπονα αφαιρούνται από
              την πλατφόρμα.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
              Τι κοστίζει
            </h2>
            <p className="text-base text-secondary leading-relaxed">
              Για τους ιδιοκτήτες οχημάτων η χρήση είναι δωρεάν: η εγγραφή, η αποστολή
              αιτημάτων, η συνομιλία με τα συνεργεία και η κράτηση δεν χρεώνονται. Το
              NextService δεν εισπράττει χρήματα από τον πελάτη — πληρώνεις μόνο την
              εργασία, απευθείας στο συνεργείο. Για τα συνεργεία δεν υπάρχει μηνιαία
              συνδρομή ούτε κόστος ανά click· τους εμπορικούς όρους τους συζητάμε απευθείας
              μαζί τους.
            </p>
          </section>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/car-details/"
              className="inline-flex bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 items-center gap-2"
            >
              <Icon name="send" size="sm" />
              Στείλε αίτημα
            </Link>
            <Link
              href="/register-professional/"
              className="inline-flex border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 items-center gap-2"
            >
              <Icon name="build" size="sm" />
              Είμαι συνεργείο
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
