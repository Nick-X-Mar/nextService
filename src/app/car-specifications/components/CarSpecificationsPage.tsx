'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
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
      vinNumber: data.vinNumber || '',
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

  const formContent = savedData.category === 'fanopeia'
    ? <BodyWorkPhotosForm savedData={savedData} />
    : <CarSpecsForm savedData={savedData} />

  return (
    <div className="bg-surface relative overflow-hidden min-h-screen">
      {/* Persona — desktop: stuck to the right side of the form area */}
      <div className="hidden lg:block absolute top-1/2 -translate-y-1/2 left-1/2 pointer-events-none z-0" style={{ marginLeft: 'calc(256px + 2vw)' }}>
        <div className="w-[20vw]">
          <Image
            src="/images/persona.webp"
            alt=""
            width={600}
            height={600}
            className="select-none w-full h-auto"
            priority={false}
          />
        </div>
      </div>


      <div className="relative z-10">
        {formContent}
      </div>
    </div>
  )
}
