'use client'

import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import type { PriceEstimate } from '@/hooks/usePriceEstimate'

interface EstimatedCostCardProps {
  estimate: PriceEstimate | null
  isLoading: boolean
}

/**
 * Reads the estimate back to the customer as what it is. When we have quoted this exact
 * model recently that is a single floor ("από 250€"); otherwise it is a range, because
 * the number came from other cars and pretending otherwise is how a 100€ estimate turns
 * into a 200€ invoice. Naming the cars it came from is the whole point — a bare number
 * invites "από πού το βγάλατε;".
 */
/** Brands and models are stored as the spreadsheet had them ("fiesta", "VW"). */
const titleCase = (s: string) =>
  s.replace(/\S+/g, (w) => (w.length > 3 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))

function basisText(estimate: PriceEstimate): string | null {
  const { closestExamples: examples, matchLevel } = estimate
  if (!examples.length) return null

  if (matchLevel === 'model') {
    const { brand, model } = examples[0]
    const years = examples.map((e) => e.year).filter((y): y is number => y !== null)
    const min = Math.min(...years)
    const max = Math.max(...years)
    const period = years.length ? ` ${min === max ? min : `${min}-${max}`}` : ''
    const car = titleCase(`${brand} ${model}${period}`.trim())
    return examples.length === 1
      ? `Με βάση ${car} που έχουμε εξυπηρετήσει`
      : `Με βάση ${examples.length} παρόμοια ${car} που έχουμε εξυπηρετήσει`
  }

  if (matchLevel === 'brand') {
    return `Με βάση παρόμοια ${titleCase(examples[0].brand)} που έχουμε εξυπηρετήσει`
  }

  return 'Με βάση παρόμοιες εργασίες που έχουμε αναλάβει'
}

export default function EstimatedCostCard({ estimate, isLoading }: EstimatedCostCardProps) {
  if (!isLoading && !estimate) return null

  const basis = estimate ? basisText(estimate) : null

  return (
    <div className="mt-3 bg-primary/5 rounded-2xl border border-primary/10 p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon name="payments" className="text-primary" size="md" />
        </div>
        <div className="flex-1">
          <p className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
            Εκτιμωμενο Κοστος
          </p>
          {isLoading || !estimate ? (
            <div className="flex items-center gap-2 text-primary">
              <Spinner size="sm" />
              <p className="text-sm font-medium">Υπολογισμος...</p>
            </div>
          ) : estimate.estimatedCostMax ? (
            // Extrapolated from other cars — quoting a single floor here is what makes the
            // garage's real price look like a surprise, so we show the span instead.
            <p className="text-xl font-black text-primary">
              {estimate.estimatedCost}€
              <span className="text-sm font-bold text-on-surface-variant/80"> – </span>
              {estimate.estimatedCostMax}€
            </p>
          ) : (
            <p className="text-xl font-black text-primary">
              <span className="text-sm font-bold text-on-surface-variant/80">από </span>
              {estimate.estimatedCost}€
            </p>
          )}
        </div>
      </div>
      {basis && (
        <p className="text-xs font-semibold text-on-surface-variant/80 mt-3 ml-[52px]">{basis}</p>
      )}
      <p className="text-xs font-semibold text-tertiary mt-2 ml-[52px]">
        Ενδεικτική εκτίμηση — συμπληρώστε τα στοιχεία σας για να λάβετε πραγματικές προσφορές από συνεργεία
      </p>
    </div>
  )
}
