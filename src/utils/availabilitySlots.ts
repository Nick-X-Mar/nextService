/**
 * Hourly appointment slots on an offer.
 *
 * An offer carries two related fields:
 *   - `availabilityDates`: ['2026-08-25', ...] — which days the garage can
 *     take the car. This predates slots and stays the source of truth for
 *     *which* days exist.
 *   - `availabilitySlots`: { '2026-08-25': ['09:00', '10:00', ...] } — which
 *     hours within each of those days.
 *
 * `availabilitySlots` is optional on purpose. Offers made before this existed
 * have none, and the UI has to keep working for them — see
 * `slotsForDate`, which treats a missing entry as "no specific hours given"
 * rather than as "no hours available". Getting that backwards would make every
 * historical offer look unbookable.
 */

export type AvailabilitySlots = Record<string, string[]>

/** Fallback when a garage has not filled in its working hours. */
export const DEFAULT_DAY_START = '09:00'
export const DEFAULT_DAY_END = '18:00'

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && HHMM.test(value)
}

/** '09:00' → 540. Returns null for anything malformed. */
export function timeToMinutes(time: string): number | null {
  if (!isValidTime(time)) return null
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * The hourly slots a garage offers on a normal day, from its own working hours.
 *
 * The end time is exclusive: a shop working 09:00–18:00 can take a car at
 * 17:00 but not at 18:00, because 18:00 is when it shuts.
 */
export function buildDayHours(
  startTime?: string | null,
  endTime?: string | null
): string[] {
  const start = timeToMinutes(startTime || '') ?? timeToMinutes(DEFAULT_DAY_START)!
  const rawEnd = timeToMinutes(endTime || '') ?? timeToMinutes(DEFAULT_DAY_END)!
  // A garage that typed an end before its start would otherwise produce an
  // empty grid with nothing to explain it.
  const end = rawEnd > start ? rawEnd : start + 60

  const hours: string[] = []
  for (let m = Math.ceil(start / 60) * 60; m < end; m += 60) {
    hours.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`)
  }
  return hours.length > 0 ? hours : [DEFAULT_DAY_START]
}

/**
 * The hours offered on one date.
 *
 * Returns null when the offer carries no slot information for that date at all
 * — an older offer, or one saved before the garage touched the grid. Callers
 * render their pre-slots behaviour ("from 09:00") in that case instead of
 * showing an empty hour list.
 */
export function slotsForDate(
  slots: AvailabilitySlots | undefined | null,
  date: string
): string[] | null {
  if (!slots) return null
  const forDate = slots[date]
  if (!Array.isArray(forDate)) return null
  return forDate.filter(isValidTime).sort()
}

/** Keep only dates the garage actually selected, and only valid times. */
export function sanitizeSlots(
  raw: unknown,
  allowedDates: string[]
): AvailabilitySlots {
  if (!raw || typeof raw !== 'object') return {}
  const allowed = new Set(allowedDates)
  const out: AvailabilitySlots = {}

  for (const [date, times] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(date) || !Array.isArray(times)) continue
    const clean = Array.from(new Set(times.filter(isValidTime))).sort()
    out[date] = clean
  }
  return out
}

/** Dates the garage kept but left with no bookable hour. */
export function datesWithNoHours(
  slots: AvailabilitySlots,
  dates: string[]
): string[] {
  return dates.filter((d) => Array.isArray(slots[d]) && slots[d].length === 0)
}

/** Is `time` bookable on `date` for this offer? */
export function isSlotAvailable(
  slots: AvailabilitySlots | undefined | null,
  date: string,
  time: string
): boolean {
  const forDate = slotsForDate(slots, date)
  // No slot data => the offer is day-granularity only, so any time the client
  // proposes is as valid as the offer ever was.
  if (forDate === null) return true
  return forDate.includes(time)
}

/** '09:00' → '09:00 π.μ.'-style label used across the Greek UI. */
export function formatTimeLabel(time: string): string {
  return isValidTime(time) ? time : ''
}
