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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className={styles.bodyText}>Φόρτωση...</p>
        </div>
      </div>
    )
  }

      // Show body work photos form for φανοποιεία category
  if (savedData.category === 'fanopeia') {
    return (
      <div className="min-h-screen bg-gray-50">
        <BodyWorkPhotosForm savedData={savedData} />
      </div>
    )
  }

  // Show car specs form for all other categories
  return (
    <div className="min-h-screen bg-gray-50">
      <CarSpecsForm savedData={savedData} />
    </div>
  )
} 