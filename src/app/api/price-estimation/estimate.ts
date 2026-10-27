import { lookupPrice } from '@/lib/price-lookup'

/**
 * The vehicle fields the price lookup reads, in the shape the request form sends them.
 * Shared by the public estimate endpoint and the request-creation route, so the price a
 * customer is shown and the one stored on their request come from the same code — the
 * stored one used to be whatever number the browser chose to send.
 */
export interface EstimateInput {
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

export interface Estimation {
  estimatedCost: number
  currency: 'EUR'
  basedOnPastJobs: number
  yearFrom: number
  yearTo: number
  category: string
  brand: string
  model?: string
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

/**
 * Null when we have never quoted this exact car — no history for the category at all
 * (ΚΤΕΟ, ελαστικά), or none close enough to be honest about. Callers show nothing then;
 * there is deliberately no fallback figure.
 */
export function estimateFor(input: EstimateInput): Estimation | null {
  const match = lookupPrice({
    category: input.category,
    brand: input.brand,
    model: input.model,
    year: toInt(input.modelYear),
    cc: toInt(input.engineCC),
    fuel: normalizeFuel(input.fuelType),
    is4x4: input.is4x4,
    isTurbo: input.isTurbo,
  })
  if (!match) return null

  return {
    estimatedCost: match.price,
    currency: 'EUR',
    basedOnPastJobs: match.sampleSize,
    yearFrom: match.yearFrom,
    yearTo: match.yearTo,
    category: input.category,
    // The matched jobs are this same car, so the card names it back with the
    // customer's own spelling rather than the sheet's ("Pegeute 206").
    brand: input.brand,
    model: input.model,
  }
}
