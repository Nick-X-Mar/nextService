/**
 * Engine displacement as the digits the forms and the price lookup work with.
 *
 * Older vehicle rows hold whatever was typed before the field was validated —
 * "1600cc", "1.6", "2,0 lt". Read raw, such a car could not be used for a request at
 * all (the API refused the value even for bodywork, where the form never shows it)
 * and could not be edited on the profile either. Litres become cc; anything that
 * still is not a number comes back unchanged, so nothing stored is silently lost.
 */
export function normalizeEngineCC(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value)) : ''
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  const compact = raw.toLowerCase().replace(/\s+/g, '')

  const cc = compact.match(/^(\d{2,5})(?:cc|cm3|κ\.?ε\.?)?\.?$/)
  if (cc) return cc[1]

  // "1.6", "1,6", "2.0l", "1.600" — a decimal under 10 can only be litres.
  const litres = compact.match(/^(\d)[.,](\d{1,3})(?:l|lt|lit|litre|liter|λ|λτ)?\.?$/)
  if (litres) return String(Math.round(Number(`${litres[1]}.${litres[2]}`) * 1000))

  return raw
}

/** A displacement the request and vehicle routes accept. */
export function isValidEngineCC(value: string): boolean {
  return /^\d{2,5}$/.test(value) && Number(value) >= 50 && Number(value) <= 9999
}
