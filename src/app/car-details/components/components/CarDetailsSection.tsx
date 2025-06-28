'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CarBrandModelSelector from './CarBrandModelSelector'
import { styles } from '../../../../styles/styles'
import { loadFormData } from '../../../../utils/formStorage'

export default function CarDetailsSection() {
  const router = useRouter()
  const [selectedBrand, setSelectedBrand] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [savedData, setSavedData] = useState({ category: '', description: '' })
  
  // Load data from localStorage
  useEffect(() => {
    const data = loadFormData()
    setSavedData({ category: data.category, description: data.description })
  }, [])

  const handleGoBack = () => {
    router.back()
  }

  return (
    <section className="bg-white">
      <div className={`${styles.container} py-24`}>
        <div className="text-center">
          <h1 className={styles.pageTitle}>
            Στοιχεία <span className="text-blue-600">Αυτοκινήτου</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Εισάγετε τα στοιχεία του αυτοκινήτου σας για να βρούμε τον κατάλληλο επαγγελματία
          </p>
          
          {/* Show selected category and description from previous page - Clickable to go back */}
          {(savedData.category || savedData.description) && (
            <div 
              onClick={handleGoBack}
              className={`${styles.cardSimple} mt-8 max-w-md mx-auto cursor-pointer hover:shadow-md hover:bg-gray-50 transition-all duration-200 border-2 border-transparent hover:border-blue-200`}
              title="Κάντε κλικ για να επιστρέψετε και να επεξεργαστείτε"
            >
              <h3 className={`${styles.cardTitle} mb-2 flex items-center justify-between`}>
                Επιλεγμένη Υπηρεσία:
                <span className="text-blue-600 text-sm font-normal">✏️ Επεξεργασία</span>
              </h3>
              {savedData.category && <p className={styles.smallText}>Κατηγορία: {savedData.category}</p>}
              {savedData.description && <p className={styles.smallText}>Περιγραφή: {savedData.description}</p>}
            </div>
          )}
          
          <CarBrandModelSelector 
            selectedBrand={selectedBrand}
            selectedModel={selectedModel}
            onBrandChange={setSelectedBrand}
            onModelChange={setSelectedModel}
          />
        </div>
      </div>
    </section>
  )
} 