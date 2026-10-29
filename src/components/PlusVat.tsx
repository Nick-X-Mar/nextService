import { PLUS_VAT } from '@/utils/vat'

/**
 * The "+ ΦΠΑ" note after a garage's price. Sized relative to the price it
 * follows (em), so it reads as a suffix whatever the price's size, and inherits
 * its color unless told otherwise.
 */
export default function PlusVat({ className = '' }: { className?: string }) {
  return <span className={`ml-1 text-[0.55em] font-bold whitespace-nowrap ${className}`}>{PLUS_VAT}</span>
}
