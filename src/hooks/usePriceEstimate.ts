'use client'

import { useCallback, useEffect, useState } from 'react'
import { saveFormData } from '@/utils/formStorage'

export interface PriceEstimateVehicle {
  category: string
  brand: string
  model?: string
  modelYear?: string | number
  engineCC?: string | number
  fuelType?: string
  isAutomatic?: boolean
  is4x4?: boolean
  isTurbo?: boolean
}

export interface PriceEstimateExample {
  brand: string
  model: string
  year: number | null
  price: number
}

export interface PriceEstimate {
  estimatedCost: number
  /** Set only when the estimate is extrapolated — then the card reads "X€ – Y€". */
  estimatedCostMax: number | null
  currency: string
  confidence: 'high' | 'medium' | 'low'
  matchLevel: 'model' | 'brand' | 'engine' | 'category'
  basedOnSimilarCars: number
  similarCarsAvailable: number
  closestExamples: PriceEstimateExample[]
  category: string
}

/**
 * Looks up what we have quoted before for the closest cars to this one.
 *
 * The estimate is recomputed rather than read back from localStorage: the lookup is
 * deterministic and cheap, so caching it would only risk showing the previous car's
 * price after the customer edits the vehicle. The result is still mirrored into form
 * storage, because that is what the submit payload reads.
 */
export function usePriceEstimate(vehicle: PriceEstimateVehicle | null) {
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { category, brand, model, modelYear, engineCC, fuelType, isAutomatic, is4x4, isTurbo } = vehicle || {}

  const fetchEstimate = useCallback(async () => {
    if (!category || !brand) return
    setIsLoading(true)
    try {
      const response = await fetch('/api/price-estimation/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category, brand, model, modelYear, engineCC, fuelType, isAutomatic, is4x4, isTurbo,
        }),
      })
      const result = await response.json()
      const next: PriceEstimate | null = result.success ? result.estimation : null
      setEstimate(next)
      saveFormData({ estimatedPrice: next?.estimatedCost ?? null })
    } catch (error) {
      console.error('Price estimation error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [category, brand, model, modelYear, engineCC, fuelType, isAutomatic, is4x4, isTurbo])

  useEffect(() => {
    fetchEstimate()
  }, [fetchEstimate])

  return { estimate, isLoading }
}
