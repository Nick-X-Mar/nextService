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
