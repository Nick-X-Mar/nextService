import FaqAccordion from '@/components/FaqAccordion'
import { collectFaqItems, getSitePage } from '@/lib/site-content'

export default async function FAQSection() {
  const page = await getSitePage('home-faq')
  const items = collectFaqItems(page.blocks)

  return (
    <section id="faq" className="scroll-mt-4 py-14 px-4 relative">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white drop-shadow-lg">
            {page.hero.title}
          </h2>
          {page.hero.lead && (
            <p className="text-white/70 text-sm mt-1 drop-shadow">{page.hero.lead}</p>
          )}
        </div>

        <FaqAccordion items={items} tone="glass" />
      </div>
    </section>
  )
}
