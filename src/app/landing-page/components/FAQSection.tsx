import Icon from '@/components/ui/Icon'

export const faqs = [
  {
    question: 'Τι είναι το NextService;',
    answer:
      'Marketplace συνεργείων αυτοκινήτου στην Ελλάδα. Στέλνετε ένα αίτημα με τα στοιχεία του οχήματος και την εργασία που χρειάζεστε, και λαμβάνετε προσφορές από συνεργεία της περιοχής σας. Επιλέγετε αυτό που σας ταιριάζει με βάση τιμή, διαθεσιμότητα και τύπο ανταλλακτικών.',
  },
  {
    question: 'Πώς λειτουργεί;',
    answer:
      'Σε τρία βήματα: (1) συμπληρώνετε στοιχεία αυτοκινήτου και βλάβης/εργασίας, (2) λαμβάνετε προσφορές από επαληθευμένα συνεργεία, (3) συνομιλείτε μαζί τους και κάνετε κράτηση online. Όλη η διαδικασία γίνεται μέσα από την πλατφόρμα.',
  },
  {
    question: 'Είναι δωρεάν για τους πελάτες;',
    answer:
      'Ναι. Η εγγραφή και η αποστολή αιτημάτων είναι εντελώς δωρεάν για τους ιδιοκτήτες αυτοκινήτων. Πληρώνετε μόνο την εργασία στο συνεργείο που θα επιλέξετε.',
  },
  {
    question: 'Πόσο γρήγορα παίρνω προσφορές από τα συνεργεία;',
    answer:
      'Συνήθως μέσα σε λίγες ώρες λαμβάνετε τις πρώτες προσφορές. Μπορείτε να συνομιλήσετε άμεσα με τα συνεργεία μέσα από την πλατφόρμα για διευκρινίσεις πριν αποφασίσετε.',
  },
  {
    question: 'Σε ποιες περιοχές της Ελλάδας λειτουργείτε;',
    answer:
      'Καλύπτουμε όλη την Ελλάδα — Αθήνα, Θεσσαλονίκη, Πάτρα, Ηράκλειο και την υπόλοιπη επικράτεια. Θα δείτε προσφορές από συνεργεία κοντά σας ώστε να αποφύγετε άσκοπες μετακινήσεις.',
  },
  {
    question: 'Τι ανταλλακτικά χρησιμοποιούν τα συνεργεία;',
    answer:
      'Τα Hot Deals περιλαμβάνουν εργασία και επώνυμα ανταλλακτικά. Σε προσαρμοσμένες προσφορές, κάθε συνεργείο αναφέρει ρητά τι ανταλλακτικά προτείνει (π.χ. OEM ή ισοδύναμα), ώστε να μπορείτε να συγκρίνετε ανοιχτά.',
  },
  {
    question: 'Πληρώνω για να κλείσω ραντεβού;',
    answer:
      'Όχι. Η κράτηση και η χρήση της πλατφόρμας είναι εντελώς δωρεάν για τους πελάτες. Πληρώνετε απευθείας στο συνεργείο μόνο την εργασία, μετά την ολοκλήρωσή της.',
  },
  {
    question: 'Είμαι ιδιοκτήτης συνεργείου — πώς εγγράφομαι;',
    answer:
      'Κάντε εγγραφή ως επαγγελματίας στη σελίδα "Εγγραφή συνεργείου" και ξεκινήστε άμεσα να λαμβάνετε αιτήματα από πελάτες της περιοχής σας. Η εγγραφή και η χρήση της πλατφόρμας είναι δωρεάν.',
  },
]

export default function FAQSection() {
  return (
    <section className="py-14 px-4 relative">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white drop-shadow-lg">
            Συχνές ερωτήσεις
          </h2>
          <p className="text-white/70 text-sm mt-1 drop-shadow">
            Όσα χρειάζεται να ξέρεις πριν στείλεις το αίτημά σου
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <h3 className="font-bold text-white text-base md:text-lg">
                  {faq.question}
                </h3>
                <Icon
                  name="expand_more"
                  size="md"
                  className="text-white/70 transition-transform group-open:rotate-180 shrink-0"
                />
              </summary>
              <div className="px-5 pb-5 text-white/85 text-sm md:text-base leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
