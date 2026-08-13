import Icon from '@/components/ui/Icon'
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
