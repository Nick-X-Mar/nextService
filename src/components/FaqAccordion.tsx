'use client'

import { useState } from 'react'
import ExpandableCard from '@/components/ExpandableCard'
import { RichLine } from '@/components/content/RichText'

interface FaqItem {
  question: string
  answer: string
}

/**
 * One open question at a time — opening the next one closes the previous, so the page
 * never grows into a wall of answers the reader has to scroll back through.
 */
export default function FaqAccordion({
  items,
  tone = 'surface',
}: {
  items: FaqItem[]
  tone?: 'surface' | 'glass'
}) {
  const [openQuestion, setOpenQuestion] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {items.map((faq, index) => (
        <ExpandableCard
          // Questions come from the admin content editor and are not guaranteed
          // unique, so the index has to be part of the key.
          key={`${index}-${faq.question}`}
          tone={tone}
          label={faq.question}
          isOpen={openQuestion === faq.question}
          onOpen={() => setOpenQuestion(faq.question)}
          onClose={() => setOpenQuestion(null)}
          keepMounted
          header={
            <h3
              className={
                tone === 'glass'
                  ? 'font-bold text-white text-base md:text-lg'
                  : 'font-bold text-on-surface text-sm md:text-base'
              }
            >
              {faq.question}
            </h3>
          }
        >
          <p
            className={
              tone === 'glass'
                ? 'text-white/85 text-sm md:text-base leading-relaxed'
                : 'text-sm text-secondary leading-relaxed'
            }
          >
            <RichLine text={faq.answer} />
          </p>
        </ExpandableCard>
      ))}
    </div>
  )
}
