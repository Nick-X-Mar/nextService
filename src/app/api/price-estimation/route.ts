import { NextRequest, NextResponse } from 'next/server'
import { withMetrics } from '@/utils/withMetrics'

interface PriceEstimationRequest {
  category: string
  brand: string
  model: string
  modelYear: string
  engineCC: string
  fuelType: 'petrol' | 'diesel'
  isAutomatic: boolean
  is4x4: boolean
}

interface PriceEstimationResponse {
  estimatedCost: number
  currency: string
  confidence: 'low' | 'medium' | 'high'
  basedOnSimilarCars: number
  category: string
}

// Mock price estimation logic - in real implementation this would query the priceestimation table
function estimatePrice(data: PriceEstimationRequest): PriceEstimationResponse {
  // Base prices by category
  const categoryBasePrices = {
    'service': 120,
    'fanopeia': 80,
    'oils': 60,
    'disk': 150
  }

  // Get base price for category
  let basePrice = categoryBasePrices[data.category as keyof typeof categoryBasePrices] || 120

  // Adjust based on car characteristics
  const year = parseInt(data.modelYear)
  const cc = parseInt(data.engineCC)

  // Newer cars cost more
  if (year >= 2020) basePrice += 30
  else if (year >= 2015) basePrice += 15
  else if (year < 2010) basePrice -= 20

  // Larger engines cost more
  if (cc >= 2000) basePrice += 25
  else if (cc >= 1500) basePrice += 10
  else if (cc < 1000) basePrice -= 15

  // Diesel cars typically cost more for service
  if (data.fuelType === 'diesel') basePrice += 20

  // Automatic transmission adds complexity
  if (data.isAutomatic) basePrice += 25

  // 4x4 adds complexity
  if (data.is4x4) basePrice += 30

  // Add some randomness to simulate market variation
  const variation = Math.random() * 40 - 20 // -20 to +20
  basePrice += variation

  // Ensure price stays within reasonable bounds
  basePrice = Math.max(80, Math.min(350, Math.round(basePrice)))

  // Determine confidence based on how common this car type is
  let confidence: 'low' | 'medium' | 'high' = 'medium'
  let basedOnSimilarCars = Math.floor(Math.random() * 15) + 5

  // Popular brands have higher confidence
  const popularBrands = ['toyota', 'volkswagen', 'bmw', 'mercedes', 'audi', 'ford']
  if (popularBrands.includes(data.brand.toLowerCase())) {
    confidence = 'high'
    basedOnSimilarCars = Math.floor(Math.random() * 25) + 15
  }

  return {
    estimatedCost: basePrice,
    currency: 'EUR',
    confidence,
    basedOnSimilarCars,
    category: data.category
  }
}

async function _POST(request: NextRequest) {
  try {
    const body: PriceEstimationRequest = await request.json()
    
    // Validate required fields
    if (!body.category || !body.brand || !body.model || !body.modelYear || !body.engineCC || !body.fuelType) {
      return NextResponse.json(
        { error: 'Missing required fields for price estimation' },
        { status: 400 }
      )
    }

    // Get price estimation
    const estimation = estimatePrice(body)

    return NextResponse.json({
      success: true,
      estimation
    })

  } catch (error) {
    console.error('Price estimation error:', error)
    return NextResponse.json(
      { error: 'Failed to estimate price' },
      { status: 500 }
    )
  }
}

// For future implementation - this would query the priceestimation table
/*
async function getPriceFromDatabase(data: PriceEstimationRequest): Promise<PriceEstimationResponse> {
  // Query the priceestimation table for similar cars and categories
  // SELECT MIN(price) FROM priceestimation 
  // WHERE category = ? AND brand = ? AND model = ? AND engineCC = ? AND fuelType = ?
  // AND isAutomatic = ? AND is4x4 = ? AND modelYear BETWEEN ? AND ?
  
  // Return the lowest price found for similar configurations
  // Include confidence score based on number of matching records
}
*/

export const POST = withMetrics(_POST)
