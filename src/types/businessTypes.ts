/**
 * What kind of shop a garage is. A shop may be more than one — a mechanic that
 * also does bodywork ticks both. Declared at registration, editable later on
 * the garage's profile and by an admin; stored as `Garages.businessTypes`.
 */
export const BUSINESS_TYPES = [
  { value: 'mechanic', label: 'Συνεργείο', icon: 'build' },
  { value: 'bodywork', label: 'Φανοποιείο', icon: 'format_paint' },
  { value: 'tyres', label: 'Βουλκανιζατέρ', icon: 'tire_repair' },
] as const

export type BusinessType = (typeof BUSINESS_TYPES)[number]['value']

/** The known types in `raw`, in catalogue order and once each; anything else is dropped. */
export function businessTypes(raw: unknown): BusinessType[] {
  if (!Array.isArray(raw)) return []
  return BUSINESS_TYPES.map((t) => t.value).filter((value) => raw.includes(value))
}

/** "Συνεργείο · Φανοποιείο", or '' when the garage has not said. */
export function businessTypesLabel(raw: unknown): string {
  const picked = businessTypes(raw)
  return BUSINESS_TYPES.filter((t) => picked.includes(t.value)).map((t) => t.label).join(' · ')
}

/** Paintwork and body repair — the jobs only a Φανοποιείο is sent. */
export const BODYWORK_CATEGORIES: ReadonlySet<string> = new Set(['oliki-vafi', 'meriki-vafi', 'fanopeia'])

/** The kind of shop a request of this category goes to. */
export function businessTypeForCategory(category: unknown): BusinessType {
  return typeof category === 'string' && BODYWORK_CATEGORIES.has(category) ? 'bodywork' : 'mechanic'
}

/**
 * Whether a garage of these types is shown a request of this category (product
 * rule): paintwork goes to the Φανοποιεία, every other job to the Συνεργεία, and
 * a garage that has not said what it is sees everything. A shop that is only a
 * Βουλκανιζατέρ is sent nothing while no request category is about tyres.
 *
 * The new-request email Lambda (`infra/lambdas/new-request-broadcast`) carries
 * a copy of this rule — change one, change the other.
 */
export function garageTakesCategory(garageTypes: unknown, category: unknown): boolean {
  const types = businessTypes(garageTypes)
  return types.length === 0 || types.includes(businessTypeForCategory(category))
}
