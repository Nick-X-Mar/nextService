import Link from 'next/link'
import { SITE_URL } from '@/lib/site-url'
import { breadcrumbJsonLd, graphJsonLd, jsonLdScript } from '@/lib/seo'

export const metadata = {
  title: 'Όροι Χρήσης',
  description: 'Όροι και προϋποθέσεις χρήσης της πλατφόρμας NextService.',
  alternates: { canonical: `${SITE_URL}/terms/` },
}

export default function TermsPage() {
  return (
    <>
      <script
        {...jsonLdScript(
          graphJsonLd([
            {
              '@type': 'WebPage',
              '@id': `${SITE_URL}/terms/#webpage`,
              name: 'Όροι Χρήσης',
              url: `${SITE_URL}/terms/`,
              inLanguage: 'el-GR',
            },
            breadcrumbJsonLd([
              { name: 'Αρχική', url: `${SITE_URL}/` },
              { name: 'Όροι Χρήσης', url: `${SITE_URL}/terms/` },
            ]),
          ])
        )}
      />
    <div className="min-h-screen bg-surface px-4 py-10">
      <div className="max-w-3xl mx-auto bg-surface-container-lowest rounded-2xl p-8 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10">
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-8">
          <p className="text-sm font-bold text-amber-900 mb-1">⚠️ ΠΡΟΣΧΕΔΙΟ — Δεν είναι το τελικό κείμενο</p>
          <p className="text-sm text-amber-800">
            Αυτοί οι Όροι Χρήσης είναι placeholder. Πριν τη δημόσια έναρξη της υπηρεσίας θα αντικατασταθούν από τελικό κείμενο που θα εκπονηθεί από νομικό σύμβουλο.
          </p>
        </div>

        <h1 className="text-3xl font-black tracking-tight text-on-surface mb-2">Όροι Χρήσης</h1>
        <p className="text-sm text-on-surface-variant mb-8">Έκδοση: 1.0 — Τελευταία ενημέρωση: {new Date().toLocaleDateString('el-GR')}</p>

        <section className="space-y-6 text-sm leading-relaxed text-on-surface">
          <div>
            <h2 className="text-lg font-bold mb-2">1. Γενικά</h2>
            <p>
              Η πλατφόρμα NextService (στο εξής &laquo;η Πλατφόρμα&raquo;) λειτουργεί ως μέσο σύνδεσης μεταξύ ιδιοκτητών οχημάτων (&laquo;Πελάτες&raquo;) και επαγγελματικών συνεργείων αυτοκινήτων (&laquo;Συνεργεία&raquo;) στην Ελλάδα. Με τη χρήση της Πλατφόρμας αποδέχεστε αυτούς τους όρους.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">2. Ρόλος της Πλατφόρμας</h2>
            <p>
              Η Πλατφόρμα είναι <strong>διαμεσολαβητική υπηρεσία</strong>. Δεν παρέχει η ίδια υπηρεσίες service αυτοκινήτων. Δεν είναι συμβαλλόμενο μέρος στη σύμβαση παροχής υπηρεσιών μεταξύ Πελάτη και Συνεργείου. Η ευθύνη για την ποιότητα της εργασίας, την τιμή και τη συμμόρφωση με τον νόμο βαρύνει το Συνεργείο.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">3. Εγγραφή και λογαριασμός</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Πρέπει να είστε άνω των 18 ετών.</li>
              <li>Πρέπει να παρέχετε αληθή και ακριβή στοιχεία.</li>
              <li>Είστε υπεύθυνοι για τη διαφύλαξη του κωδικού σας.</li>
              <li>Διατηρούμε το δικαίωμα να αναστείλουμε ή να διαγράψουμε λογαριασμούς σε περίπτωση κατάχρησης.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">4. Υποχρεώσεις των Πελατών</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Παροχή ακριβών στοιχείων για το όχημα και το πρόβλημα.</li>
              <li>Μη χρήση της πλατφόρμας για παράνομους σκοπούς.</li>
              <li>Σεβασμός των Συνεργείων στις συνομιλίες.</li>
              <li>Έγκαιρη ενημέρωση σε περίπτωση ακύρωσης ραντεβού.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">5. Υποχρεώσεις των Συνεργείων</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Παροχή νόμιμης άδειας λειτουργίας και ΑΦΜ.</li>
              <li>Παροχή ειλικρινών, διαφανών προσφορών.</li>
              <li>Τήρηση των τιμών που αναγράφονται στις προσφορές.</li>
              <li>Τήρηση των ραντεβού.</li>
              <li><strong>Εμπιστευτικότητα στοιχείων Πελάτη:</strong> Τα στοιχεία επικοινωνίας και οχήματος του Πελάτη μπορούν να χρησιμοποιηθούν αποκλειστικά για το συγκεκριμένο αίτημα service. Απαγορεύεται η αποθήκευσή τους σε εξωτερικές βάσεις, η χρήση τους για marketing ή η μεταβίβασή τους σε τρίτους.</li>
              <li>Έκδοση των απαραίτητων νόμιμων παραστατικών στον Πελάτη.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">6. Προσφορές και ραντεβού</h2>
            <p>
              Όταν ένας Πελάτης δημοσιεύει αίτημα, εγγεγραμμένα Συνεργεία μπορούν να δουν τα στοιχεία του οχήματος και να στείλουν προσφορές. Όταν ο Πελάτης αποδεχτεί προσφορά, δημιουργείται προγραμματισμένο ραντεβού και τα στοιχεία επικοινωνίας μοιράζονται με το επιλεγμένο Συνεργείο.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">7. Πληρωμές</h2>
            <p>
              Η πληρωμή για τις υπηρεσίες service γίνεται απευθείας μεταξύ Πελάτη και Συνεργείου. Η Πλατφόρμα δεν επεξεργάζεται πληρωμές για τις εργασίες service.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">8. Περιορισμός ευθύνης</h2>
            <p>
              Η Πλατφόρμα παρέχεται &laquo;ως έχει&raquo;. Δεν εγγυόμαστε την ποιότητα των υπηρεσιών των Συνεργείων. Δεν φέρουμε ευθύνη για ζημιές που προκύπτουν από τη χρήση των υπηρεσιών των Συνεργείων. Σε κάθε περίπτωση, η ευθύνη μας περιορίζεται στο νόμιμα επιτρεπτό όριο.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">9. Πνευματική ιδιοκτησία</h2>
            <p>
              Όλο το περιεχόμενο της Πλατφόρμας (λογότυπο, σχέδιο, κώδικας) ανήκει στο NextService. Απαγορεύεται η αναπαραγωγή χωρίς άδεια.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">10. Καταγγελία λογαριασμού</h2>
            <p>
              Μπορείτε να διαγράψετε τον λογαριασμό σας ανά πάσα στιγμή από τις ρυθμίσεις του προφίλ σας. Διατηρούμε το δικαίωμα να καταγγείλουμε λογαριασμούς που παραβιάζουν αυτούς τους όρους ή τον νόμο.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">11. Εφαρμοστέο δίκαιο</h2>
            <p>
              Αυτοί οι όροι διέπονται από το ελληνικό δίκαιο. Αρμόδια δικαστήρια είναι τα δικαστήρια [ΠΟΛΗΣ ΕΔΡΑΣ].
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-2">12. Επικοινωνία</h2>
            <p>
              Για κάθε ερώτηση σχετικά με αυτούς τους όρους: <a href="mailto:legal@nextservice.gr" className="text-primary underline">legal@nextservice.gr</a>
            </p>
          </div>
        </section>

        <div className="mt-8 pt-6 border-t border-outline-variant/20 text-center">
          <Link href="/" className="text-sm text-primary underline">Επιστροφή στην αρχική</Link>
        </div>
      </div>
    </div>
    </>
  )
}
