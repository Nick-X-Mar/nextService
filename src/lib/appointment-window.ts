import { athensDateTime } from '@/utils/athensTime'
import { DEFAULT_DAY_START, isValidTime } from '@/utils/availabilitySlots'

/**
 * When an appointment begins, read as Europe/Athens wall-clock.
 *
 * Appointments booked before hourly slots existed carry no time; they are
 * taken to start when a garage opens by default, so "has it started?" never
 * answers "no" while the car could already be on the ramp.
 */
export function appointmentStartsAt(date: string, time?: string | null): Date | null {
  return athensDateTime(date, isValidTime(time) ? time : DEFAULT_DAY_START)
}

/**
 * Whether the client can no longer back out of an appointment.
 *
 * Once it has started, the job either happened or the client did not turn up,
 * and only the garage can say which — a cancel at that point would erase the
 * completion, the commission and both reviews. A malformed date answers false
 * so a corrupt row never traps a client in a booking.
 */
export function hasAppointmentStarted(
  date: string | undefined | null,
  time?: string | null,
  now: Date = new Date()
): boolean {
  if (!date) return false
  const start = appointmentStartsAt(date, time)
  return start !== null && now.getTime() >= start.getTime()
}
