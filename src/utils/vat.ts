/**
 * Garages quote net of VAT, so every price a garage gave — an offer, a booked
 * job, the estimate built from past quotes, a hot deal — is shown with this
 * next to it. `<PlusVat />` is the same note for JSX.
 */
export const PLUS_VAT = '+ ΦΠΑ'

/** `"200€"` → `"200€ + ΦΠΑ"`, for titles, share text and other plain strings. */
export function withPlusVat(price: string): string {
  return price ? `${price} ${PLUS_VAT}` : price
}
