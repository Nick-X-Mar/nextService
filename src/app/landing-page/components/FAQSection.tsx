import FaqAccordion from '@/components/FaqAccordion'
import { faqs } from '@/data/faq'


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

        <FaqAccordion items={faqs} tone="glass" />
      </div>
    </section>
  )
}
