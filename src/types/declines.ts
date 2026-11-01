/**
 * Why a garage says it cannot take a request. Picked from this list on the
 * request card; `other` needs a line of text. The request then leaves the
 * garage's feed and shows under Προσφορές → Απορριφθείσες. The client is never
 * told: they simply get one offer fewer.
 */
export const DECLINE_REASONS = [
  { code: 'no_capacity', label: 'Δεν έχω διαθεσιμότητα αυτές τις μέρες' },
  { code: 'not_our_work', label: 'Δεν κάνουμε αυτή την εργασία' },
  { code: 'vehicle', label: 'Δεν αναλαμβάνουμε αυτή τη μάρκα ή το μοντέλο' },
  { code: 'parts', label: 'Δεν βρίσκονται ανταλλακτικά' },
  { code: 'distance', label: 'Είναι μακριά από το συνεργείο' },
  { code: 'more_info', label: 'Χρειάζομαι να δω το αυτοκίνητο από κοντά' },
  { code: 'other', label: 'Άλλος λόγος' },
] as const

export type DeclineReason = (typeof DECLINE_REASONS)[number]['code']

export function declineReasonLabel(code: string | undefined, text?: string): string {
  if (code === 'other' && text) return text
  return DECLINE_REASONS.find((r) => r.code === code)?.label ?? 'Δεν αναλήφθηκε'
}

export function isDeclineReason(value: unknown): value is DeclineReason {
  return DECLINE_REASONS.some((r) => r.code === value)
}
