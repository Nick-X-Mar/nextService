'use client'

import { useState, useEffect } from 'react'
import CarSpecsForm from './components/CarSpecsForm'
import BodyWorkPhotosForm from './components/BodyWorkPhotosForm'
import { loadFormData } from '../../../utils/formStorage'

export default function CarSpecificationsPage() {
  const [savedData, setSavedData] = useState({
    category: '',
    description: '',
    brand: '',
    model: '',
    modelYear: '',
    vinNumber: '',
    engineCC: '',
    fuelType: '',
    isAutomatic: false,
    is4x4: false,
    estimatedPrice: null as number | null
  })
  const [isLoading, setIsLoading] = useState(true)

  // Load saved data on component mount
  useEffect(() => {
    const data = loadFormData()
    setSavedData({
      category: data.category,
      description: data.description,
      brand: data.brand,
      model: data.model,
      modelYear: data.modelYear,
      vinNumber: data.vinNumber || '', // VIN might be empty initially since it's collected on page 3
      engineCC: data.engineCC,
      fuelType: data.fuelType || '',
      isAutomatic: data.isAutomatic || false,
      is4x4: data.is4x4 || false,
      estimatedPrice: data.estimatedPrice || null
    })
    setIsLoading(false)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-base text-secondary leading-relaxed">Φορτωση...</p>
        </div>
      </div>
    )
  }

      // Show body work photos form for φανοποιεία category
  if (savedData.category === 'fanopeia') {
    return (
      <div className="bg-surface">
        <BodyWorkPhotosForm savedData={savedData} />
      </div>
    )
  }

  // Show car specs form for all other categories
  return (
    <div className="bg-surface">
      <CarSpecsForm savedData={savedData} />
    </div>
  )
}
