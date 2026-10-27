'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Spinner from '@/components/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import CarSpecsForm from './components/CarSpecsForm'
import BodyWorkPhotosForm from './components/BodyWorkPhotosForm'
import { claimFormData, loadFormData, guestOwner } from '../../../utils/formStorage'

const BODYWORK_CATEGORIES = new Set(['fanopeia', 'oliki-vafi', 'meriki-vafi'])

export default function CarSpecificationsPage() {
  const router = useRouter()
  const [savedData, setSavedData] = useState({
    category: '',
    description: '',
    brand: '',
    model: '',
    isBrandOther: false,
    isModelOther: false,
    modelYear: '',
    vinNumber: '',
    engineCC: '',
    fuelType: '',
    isAutomatic: false,
    is4x4: false,
    isTurbo: false,
    estimatedPrice: null as number | null
  })
  const [isLoading, setIsLoading] = useState(true)
  const { client, garage, isVerified } = useAuth()
  const loaded = useRef(false)

  // Load the draft once the server has said who we are, and only after making it
  // ours: this step shows the saved car's άδεια and numbers, and is reachable straight
  // from history on a browser someone else used before. Once only — the submit clears
  // the draft and may sign a guest in, and re-reading then would bounce to step 1.
  const owner = isVerified ? client?.id ?? garage?.id ?? guestOwner() : null
  useEffect(() => {
    if (!owner || loaded.current) return
    loaded.current = true
    claimFormData(owner)
    const data = loadFormData()

    // Step 1 isn't done — a direct visit, cleared storage, or browser Back after a
    // submit (the draft is cleared then). Without a category and a car this page
    // could only fail at the very end with "Λείπουν: …"; send them to step 1, which
    // asks for the category first.
    if (!data.category || !data.brand || !data.model || !data.modelYear) {
      router.replace('/car-details/')
      return
    }

    setSavedData({
      category: data.category,
      description: data.description,
      brand: data.brand,
      model: data.model,
      isBrandOther: data.isBrandOther || false,
      isModelOther: data.isModelOther || false,
      modelYear: data.modelYear,
      vinNumber: data.vinNumber || '',
      engineCC: data.engineCC,
      fuelType: data.fuelType || '',
      isAutomatic: data.isAutomatic || false,
      is4x4: data.is4x4 || false,
      isTurbo: data.isTurbo || false,
      estimatedPrice: data.estimatedPrice || null
    })
    setIsLoading(false)
  }, [owner, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="text-primary mx-auto mb-4" />
          <p className="text-base text-secondary leading-relaxed">Φόρτωση...</p>
        </div>
      </div>
    )
  }

  const formContent = BODYWORK_CATEGORIES.has(savedData.category)
    ? <BodyWorkPhotosForm savedData={savedData} />
    : <CarSpecsForm savedData={savedData} />

  return (
    <div className="bg-surface min-h-screen">
      {formContent}
    </div>
  )
}
