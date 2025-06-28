'use client'

import { useState, useEffect } from 'react'
import CarSpecsForm from './components/CarSpecsForm'
import BodyWorkPhotosForm from './components/BodyWorkPhotosForm'
import { loadFormData } from '../../../utils/formStorage'
import { styles } from '../../../styles/styles'

export default function CarSpecificationsPage() {
  const [savedData, setSavedData] = useState({ 
    category: '', 
    description: '', 
    brand: '', 
    model: '' 
  })
  const [isLoading, setIsLoading] = useState(true)

  // Load saved data on component mount
  useEffect(() => {
    const data = loadFormData()
    setSavedData({
      category: data.category,
      description: data.description,
      brand: data.brand,
      model: data.model
    })
    setIsLoading(false)
  }, [])

  if (isLoading) {
    return (
      <div className={styles.pageCenter}>
        <div className="text-center">
          <div className={styles.loadingSpinner}></div>
          <p className={styles.bodyText}>Φόρτωση...</p>
        </div>
      </div>
    )
  }

      // Show body work photos form for φανοποιεία category
  if (savedData.category === 'fanopeia') {
    return (
      <div className={styles.pageWrapper}>
        <BodyWorkPhotosForm savedData={savedData} />
      </div>
    )
  }

  // Show car specs form for all other categories
  return (
    <div className={styles.pageWrapper}>
      <CarSpecsForm savedData={savedData} />
    </div>
  )
} 