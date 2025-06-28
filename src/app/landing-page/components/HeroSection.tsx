'use client'

import { useState } from 'react'
import CategorySelector from './CategorySelector'
import CategoryChips from './CategoryChips'
import { styles } from '../../../styles/styles'

export default function HeroSection() {
  const [selectedCategory, setSelectedCategory] = useState('')
  return (
    <section className="bg-white">
      <div className={`${styles.container} py-24`}>
        <div className="text-center">
          <h1 className={styles.pageTitle}>
            Βρείτε τον καλύτερο
            <span className="text-blue-600"> επαγγελματία</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Η πλατφόρμα που συνδέει πελάτες με έμπειρους επαγγελματίες. 
            Βρείτε την υπηρεσία που χρειάζεστε γρήγορα και εύκολα.
          </p>
          <CategoryChips 
            selectedCategory={selectedCategory}
            onCategorySelect={setSelectedCategory}
          />
          <CategorySelector 
            selectedCategory={selectedCategory}
            onCategorySelect={setSelectedCategory}
          />
        </div>
      </div>
    </section>
  )
} 