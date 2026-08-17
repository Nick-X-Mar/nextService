'use client'

import Icon from '@/components/ui/Icon'
import Spinner from '@/components/Spinner'
import type { PriceEstimate } from '@/hooks/usePriceEstimate'

interface EstimatedCostCardProps {
  estimate: PriceEstimate | null
  isLoading: boolean
}

/**
 * Reads the estimate back to the customer as a floor, never a range: the number is the
 * lowest we have quoted for this exact car, so "από X€" is the only claim it supports.
 * Naming the cars it came from is the whole point — a bare number invites "από πού το
 * βγάλατε;". When the lookup finds no match the estimate is null and this card does not
 * render at all.
 */
/** The customer types the car in lowercase as often as not ("fiesta", "toyota"). */
const titleCase = (s: string) =>
  s.replace(/\S+/g, (w) => (w.length > 3 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))

function basisText(estimate: PriceEstimate): string {
  const { basedOnPastJobs, brand, model, yearFrom, yearTo } = estimate
  const period = yearFrom === yearTo ? `${yearFrom}` : `${yearFrom}-${yearTo}`
  const car = titleCase(`${brand} ${model || ''} ${period}`.replace(/\s+/g, ' ').trim())

  return basedOnPastJobs === 1
    ? `Με βάση ${car} που έχουμε εξυπηρετήσει`
    : `Με βάση ${basedOnPastJobs} αντίστοιχα ${car} που έχουμε εξυπηρετήσει`
}

export default function EstimatedCostCard({ estimate, isLoading }: EstimatedCostCardProps) {
  // No matching past job. Say so plainly and point at what the customer actually came for
  // — the real offers — instead of leaving a silent gap where a price used to be.
  if (!isLoading && !estimate) {
    return (
      <div className="mt-3 bg-surface-container rounded-2xl border border-outline-variant/20 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-surface-container-highest flex items-center justify-center flex-shrink-0">
            <Icon name="search_off" className="text-on-surface-variant" size="md" />
          </div>
          <div className="flex-1">
            {/* Written without accents on purpose — the label is uppercased in CSS. */}
            <p className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
              Χωρις Εκτιμηση Κοστους
            </p>
            <p className="text-sm font-semibold text-on-surface-variant">
              Δεν υπάρχουν επαρκή στοιχεία για εκτίμηση κόστους.
            </p>
          </div>
        </div>
        <p className="text-sm font-bold text-primary mt-2 ml-[52px]">
          Συνεχίστε για να λάβετε προσφορές από τα συνεργεία.
        </p>
      </div>
    )
  }

  const basis = estimate ? basisText(estimate) : null

  return (
    <div className="mt-3 bg-primary/5 rounded-2xl border border-primary/10 p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon name="payments" className="text-primary" size="md" />
        </div>
        <div className="flex-1">
          <p className="text-[0.7rem] font-black uppercase tracking-widest text-on-surface-variant/80">
            Εκτιμωμενο Κοστος Απο
          </p>
          {isLoading || !estimate ? (
            <div className="flex items-center gap-2 text-primary">
              <Spinner size="sm" />
              <p className="text-sm font-medium">Υπολογισμος...</p>
            </div>
          ) : (
            <p className="text-xl font-black text-primary">{estimate.estimatedCost}€</p>
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
