'use client'

import { useEffect, useRef } from 'react'
import { track } from '@/lib/track'

export type FormStep = 'car_details' | 'car_specs'

/**
 * Records, once per field per visit to the step, the moment a field of the
 * request form first holds a usable value (`form_field_filled`). Counted per
 * visitor next to `car_details_started` / `car_specs_started`, the admin funnel
 * shows how far down each step people get, and so at which field they stop.
 *
 * `filled` maps a field name to whether it is filled now. A value restored from
 * the draft counts as filled the moment it appears, like one typed in.
 */
export function useFieldTracking(step: FormStep, category: string | undefined, filled: Record<string, boolean>) {
  const sent = useRef<Set<string>>(new Set())
  // Only the set of filled fields matters, not the object's identity.
  const key = Object.keys(filled).filter((field) => filled[field]).sort().join(',')

  useEffect(() => {
    for (const field of key ? key.split(',') : []) {
      if (sent.current.has(field)) continue
      sent.current.add(field)
      track('form_field_filled', { step, field, category: category || '' })
    }
  }, [key, step, category])
}
