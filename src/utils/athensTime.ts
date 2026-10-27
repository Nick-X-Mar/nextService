/**
 * Appointment dates and hours are Greek wall-clock values — 'YYYY-MM-DD' plus
 * 'HH:MM', with no zone attached. They must be read as Europe/Athens on every
 * runtime: the Amplify SSR runtime runs in UTC and a browser in whatever zone
 * the device is set to, so parsing them as "local" made the server, the
 * browser and the completion-sweeper Lambda disagree by two to three hours on
 * when a slot had passed, and by a whole day on what "today" is between
 * 00:00 and 03:00.
 *
 * The sweeper Lambda (infra/lambdas/appointment-completion-sweeper) cannot
 * import this file and carries its own copy of the same logic — change both.
 */

const ZONE = 'Europe/Athens'

const PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Athens' offset from UTC at a given instant, in minutes (120 in winter, 180 in summer). */
function athensOffsetMinutes(at: Date): number {
  const parts = PARTS_FORMAT.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  return Math.round((wallAsUtc - at.getTime()) / 60_000)
}

/** The instant an Athens date + 'HH:MM' refers to, or null if either is malformed. */
export function athensDateTime(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null

  const wallAsUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
  // Date.UTC rolls over instead of failing ('2026-13-01' → January 2027), so
  // reject anything that doesn't come back as the same calendar date and hour.
  const check = new Date(wallAsUtc)
  if (
    check.getUTCMonth() !== +d[2] - 1 ||
    check.getUTCDate() !== +d[3] ||
    check.getUTCHours() !== +t[1] ||
    check.getUTCMinutes() !== +t[2]
  ) {
    return null
  }

  // Guess with the offset at the wall-clock instant, then re-check at the
  // result: the two differ only within the hour around a DST switch.
  const guess = athensOffsetMinutes(new Date(wallAsUtc))
  let instant = wallAsUtc - guess * 60_000
  const actual = athensOffsetMinutes(new Date(instant))
  if (actual !== guess) instant = wallAsUtc - actual * 60_000
  return new Date(instant)
}

/** Today's date in Athens, as 'YYYY-MM-DD'. */
export function athensToday(now: Date = new Date()): string {
  return DATE_FORMAT.format(now)
}

/**
 * Whole calendar days from Athens' today to `date` — 0 for today, 1 for
 * tomorrow, negative for the past. Null if `date` is malformed.
 */
export function athensDaysUntil(date: string, now: Date = new Date()): number | null {
  const target = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const today = /^(\d{4})-(\d{2})-(\d{2})$/.exec(athensToday(now))
  if (!target || !today) return null
  const a = Date.UTC(+today[1], +today[2] - 1, +today[3])
  const b = Date.UTC(+target[1], +target[2] - 1, +target[3])
  return Math.round((b - a) / 86_400_000)
}

/** Whether an Athens date lies before Athens' today. */
export function isPastAthensDate(date: string, now: Date = new Date()): boolean {
  const days = athensDaysUntil(date, now)
  return days !== null && days < 0
}
