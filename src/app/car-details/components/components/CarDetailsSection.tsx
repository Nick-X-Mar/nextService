'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CarBrandModelSelector from './CarBrandModelSelector'
import { styles } from '../../../../styles/styles'
import { loadFormData } from '../../../../utils/formStorage'

export default function CarDetailsSection() {
  const router = useRouter()
  const [savedData, setSavedData] = useState({ 
    category: '', 
    description: '', 
    brand: '', 
    model: '', 
    modelYear: '' 
  })
  
  // Load data from localStorage
  useEffect(() => {
    const data = loadFormData()
    setSavedData({ 
      category: data.category, 
      description: data.description,
      brand: data.brand,
      model: data.model,
      modelYear: data.modelYear
    })
  }, [])

  const handleGoBack = () => {
    router.back()
  }

  return (
    <section className="bg-white">
      <div className={`${styles.container} py-24`}>
        <div className="text-center">
          <h1 className={styles.pageTitle}>
            Τεχνικά <span className={styles.titleHighlight}>Στοιχεία</span>
          </h1>
          <p className={`mt-3 max-w-md mx-auto ${styles.bodyText} sm:text-lg md:mt-5 md:text-xl md:max-w-3xl`}>
            Παρακαλώ συμπληρώστε τα τεχνικά χαρακτηριστικά του αυτοκινήτου σας
          </p>
          
          {/* Show selected car information from previous page - Clickable to go back */}
          {(savedData.brand || savedData.model || savedData.modelYear) && (
            <div 
              onClick={handleGoBack}
              className={`${styles.cardSimple} mt-8 max-w-md mx-auto cursor-pointer hover:shadow-md hover:bg-gray-50 transition-all duration-200 border-2 border-transparent hover:border-blue-200`}
              title="Κάντε κλικ για να επιστρέψετε και να επεξεργαστείτε"
            >
              <h3 className={`${styles.cardTitle} mb-2 flex items-center justify-between`}>
                Επιλεγμένο Όχημα:
                <span className="text-blue-600 text-sm font-normal">✏️ Επεξεργασία</span>
              </h3>
              {savedData.brand && savedData.model && (
                <p className={styles.smallText}>{savedData.brand} {savedData.model}</p>
              )}
              {savedData.modelYear && <p className={styles.smallText}>Έτος: {savedData.modelYear}</p>}
              {savedData.category && <p className={styles.smallText}>Υπηρεσία: {savedData.category}</p>}
            </div>
          )}
          
          <CarBrandModelSelector 
            selectedBrand=""
            selectedModel=""
            onBrandChange={() => {}}
            onModelChange={() => {}}
          />
        </div>
      </div>
    </section>
  )
} 