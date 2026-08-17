import { NextRequest, NextResponse } from 'next/server'
import { withMetrics } from '@/utils/withMetrics'
import { lookupPrice, type PriceLookupInput } from '@/lib/price-lookup'

interface PriceEstimationRequest {
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

function toInt(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/** The form sends 'petrol' | 'diesel'; the dataset also carries lpg / hybrid / ev. */
function normalizeFuel(fuel: string | undefined): string | null {
  if (!fuel) return null
  const f = fuel.toLowerCase()
  if (f.includes('diesel') || f.includes('πετρελ')) return 'diesel'
  if (f.includes('petrol') || f.includes('βενζ')) return 'petrol'
  if (f.includes('lpg') || f.includes('υγραερ')) return 'lpg'
  if (f.includes('hybrid') || f.includes('υβριδ')) return 'hybrid'
  if (f.includes('electric') || f.includes('ηλεκτρ')) return 'ev'
  return null
}

async function _POST(request: NextRequest) {
  try {
    const body: PriceEstimationRequest = await request.json()

    if (!body.category || !body.brand) {
      return NextResponse.json(
        { error: 'Missing required fields for price estimation' },
        { status: 400 }
      )
    }

    const input: PriceLookupInput = {
      category: body.category,
      brand: body.brand,
      model: body.model,
      year: toInt(body.modelYear),
      cc: toInt(body.engineCC),
      fuel: normalizeFuel(body.fuelType),
      is4x4: body.is4x4,
      isTurbo: body.isTurbo,
    }

    const match = lookupPrice(input)

    // No history for this category yet (e.g. ΚΤΕΟ, ελαστικά) — say so instead of
    // inventing a number; the client hides the estimate card when estimation is null.
    if (!match) {
      return NextResponse.json({ success: true, estimation: null })
    }

    return NextResponse.json({
      success: true,
      estimation: {
        estimatedCost: match.price,
        // Null when we have quoted this exact model recently — the client then shows the
        // single "από X€" instead of a range.
        estimatedCostMax: match.priceMax,
        currency: 'EUR',
        confidence: match.confidence,
        matchLevel: match.matchLevel,
        basedOnSimilarCars: match.sampleSize,
        similarCarsAvailable: match.poolSize,
        closestExamples: match.closest,
        category: body.category,
      },
    })
  } catch (error) {
    console.error('Price estimation error:', error)
    return NextResponse.json(
      { error: 'Failed to estimate price' },
      { status: 500 }
    )
  }
}

export const POST = withMetrics(_POST)
