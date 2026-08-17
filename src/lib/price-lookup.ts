/**
 * Price estimation by lookup, not by formula.
 *
 * For a request like "Ford Fiesta 2005, ιμάντας" we find the closest cars we have
 * actually quoted before and surface the lowest of those prices. The dataset is
 * src/data/price-examples.json, regenerated from the offers spreadsheet with
 * `npx tsx scripts/build-price-examples.ts`.
 */
import dataset from '@/data/price-examples.json'

export type MatchLevel = 'model' | 'brand' | 'engine' | 'category'
export type Confidence = 'high' | 'medium' | 'low'

export interface PriceLookupInput {
  category: string
  brand: string
  model?: string
  year?: number | null
  cc?: number | null
  fuel?: string | null
  is4x4?: boolean
  isTurbo?: boolean
}

export interface MatchedExample {
  brand: string
  model: string
  year: number | null
  price: number
}

export interface PriceLookupResult {
  /** The lowest price among the closest examples — the "από" figure. */
  price: number
  /**
   * Upper end of the range, or null when we are quoting a real job rather than
   * extrapolating. See `isSolidMatch` — null means "show the single price".
   */
  priceMax: number | null
  matchLevel: MatchLevel
  confidence: Confidence
  /** How many past jobs the estimate was drawn from (max NEIGHBOURS). */
  sampleSize: number
  /** How many examples the matching tier held in total. */
  poolSize: number
  closest: MatchedExample[]
}

/** A past job, as stored in price-examples.json (short keys — the file ships to the client). */
export interface Example {
  /** category */ c: string
  /** canonical brand */ b: string
  /** canonical model */ m: string
  /** brand as written */ bl: string
  /** model as written */ ml: string
  /** year */ y: number | null
  /** engine cc */ cc: number | null
  /** fuel */ f: string | null
  /** 4x4 */ x4?: boolean
  /** turbo */ tb?: boolean
  /** price € */ p: number
}

export const EXAMPLES = dataset.examples as Example[]

/** How many of the closest cars the quoted minimum is drawn from. */
const NEIGHBOURS = 3

/**
 * A neighbour only counts if it is nearly as close as the best one. Without this, a
 * Fiesta 2015 (two exact-year quotes at 800€ for the wet-belt engine) would still be
 * priced off a 2009 example at 200€ just to fill the third slot.
 */
const NEIGHBOUR_TOLERANCE = 4

/** Distance penalties, expressed in "years of difference" so they stay comparable. */
const PENALTY = {
  unknownYear: 12,
  fuelMismatch: 8,
  fuelUnknown: 2,
  /** 4x4 changes the job itself (transfer case, more labour), so it outweighs age. */
  driveMismatch: 10,
  turboMismatch: 6,
  perCc: 1 / 150,
}

/** How far apart two engines can be and still count as the same class. */
const CC_WINDOW = 300

/**
 * When we have genuinely quoted this model at roughly this age, the cheapest of those
 * quotes is a promise we can keep, so it is shown on its own ("από 250€"). Anything
 * further out is extrapolation — same badge but a different generation, or another car
 * of the same brand — and gets a range instead.
 *
 * Measured leave-one-out over the dataset: inside the gate the real price came in more
 * than 25% above the quoted floor 17% of the time; outside it, 27%. Quoting a range
 * there brings that back down to 7%.
 */
const SOLID_YEAR_GAP = 3
/** Range floor for extrapolated estimates: whichever is higher, the dearest neighbour
 *  or the cheapest one plus this margin. Wider adds nothing, narrower stops covering. */
const RANGE_MARGIN = 1.3

/** Same normalisation the build script applies, so the keys line up. */
function normalize(s: string): string {
  let out = (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const greek = 'αβγδεζηικλμνοπρστυφχω'
  const latin = 'avgdeziiklmnoprstyfxo'
  out = [...out].map((ch) => { const i = greek.indexOf(ch); return i === -1 ? ch : latin[i] }).join('')
  return out.replace(/[^a-z0-9]/g, '')
}

const BRAND_ALIASES: Record<string, string> = {
  vw: 'volkswagen', wv: 'volkswagen', scoda: 'skoda', skota: 'skoda',
  mercedesbenz: 'mercedes', merchedes: 'mercedes', landrover: 'land',
  alfaromeo: 'alfa', citroem: 'citroen', citroe: 'citroen', hyndai: 'hyundai',
  huyndai: 'hyundai', peugot: 'peugeot', reno: 'renault',
}

function canonBrand(s: string): string {
  const n = normalize(s)
  return BRAND_ALIASES[n] || n
}

/** Categories the app offers but the dataset has no history for yet. */
export function hasDataFor(category: string): boolean {
  return EXAMPLES.some((e) => e.c === category)
}

/**
 * How far an example is from the request. Year drives it; fuel, drivetrain and engine
 * size act as tie-breakers so a diesel 4x4 prefers a diesel 4x4 neighbour over a petrol
 * one of the same year.
 */
function distance(input: PriceLookupInput, e: Example): number {
  let d = input.year && e.y ? Math.abs(input.year - e.y) : PENALTY.unknownYear

  if (input.fuel && e.f) {
    if (input.fuel !== e.f) d += PENALTY.fuelMismatch
  } else if (input.fuel || e.f) {
    d += PENALTY.fuelUnknown
  }

  if (input.is4x4 !== undefined && !!input.is4x4 !== !!e.x4) d += PENALTY.driveMismatch
  if (input.isTurbo !== undefined && !!input.isTurbo !== !!e.tb) d += PENALTY.turboMismatch
  if (input.cc && e.cc) d += Math.abs(input.cc - e.cc) * PENALTY.perCc

  return d
}

/**
 * Widening ladder — the first rung with anything in it wins, so a real same-model quote
 * always beats a same-brand one.
 *
 * Drivetrain and forced induction act as a hard gate on the upper rungs rather than as
 * ranking hints, because they change the job itself. That deliberately lets a same-cc
 * car from another brand outrank a same-badge car of a different type: if the only
 * Dacia we have quoted is a 4x4 Duster, a 1.2 Sandero is priced better off someone
 * else's 1.2 hatchback. When the customer told us neither flag, every gate is open and
 * the ladder collapses back to model → brand → engine → category.
 */
function selectPool(input: PriceLookupInput, all: Example[]): { pool: Example[]; level: MatchLevel } {
  const brand = canonBrand(input.brand)
  const model = normalize(input.model || '')

  const sameProfile = (e: Example) =>
    (input.is4x4 === undefined || !!input.is4x4 === !!e.x4) &&
    (input.isTurbo === undefined || !!input.isTurbo === !!e.tb)

  const sameModel = (e: Example) => {
    if (!brand || !model || e.b !== brand) return false
    if (e.m === model) return true
    // The sheet writes trim levels into the model ("qashqai J10", "astra G"), so a bare
    // "Qashqai" has to still find them. 3+ chars to avoid C3/C30 mixups.
    return model.length >= 3 && e.m.length >= 3 && (e.m.startsWith(model) || model.startsWith(e.m))
  }

  const sameBrand = (e: Example) => !!brand && e.b === brand
  const sameEngine = (e: Example) => !!input.cc && !!e.cc && Math.abs(e.cc - input.cc!) <= CC_WINDOW

  const rungs: [MatchLevel, (e: Example) => boolean][] = [
    ['model', (e) => sameModel(e) && sameProfile(e)],
    ['model', sameModel],
    ['brand', (e) => sameBrand(e) && sameProfile(e)],
    ['engine', (e) => sameEngine(e) && sameProfile(e)],
    ['brand', sameBrand],
    ['engine', sameEngine],
  ]

  for (const [level, matches] of rungs) {
    const pool = all.filter(matches)
    if (pool.length) return { pool, level }
  }
  return { pool: all, level: 'category' }
}

function confidenceOf(level: MatchLevel, sampleSize: number): Confidence {
  if (level === 'model') return sampleSize >= 2 ? 'high' : 'medium'
  if (level === 'brand') return 'medium'
  return 'low'
}

export function lookupPrice(input: PriceLookupInput): PriceLookupResult | null {
  return lookupPriceIn(EXAMPLES, input)
}

/**
 * Same lookup against an explicit set of examples. Exists so the dataset can be
 * validated leave-one-out (`scripts/validate-price-lookup.ts`) against the very code
 * that serves requests, rather than against a copy of it.
 */
export function lookupPriceIn(examples: Example[], input: PriceLookupInput): PriceLookupResult | null {
  const inCategory = examples.filter((e) => e.c === input.category)
  if (!inCategory.length) return null

  const { pool, level } = selectPool(input, inCategory)
  const ranked = [...pool]
    .map((e) => ({ e, d: distance(input, e) }))
    // Ties on distance (same year, no fuel info) resolve to the cheaper quote, which is
    // the number we are about to show anyway.
    .sort((a, b) => a.d - b.d || a.e.p - b.e.p)

  const cutoff = ranked[0].d + NEIGHBOUR_TOLERANCE
  const closest = ranked.filter(({ d }) => d <= cutoff).slice(0, NEIGHBOURS).map(({ e }) => e)

  const prices = closest.map((e) => e.p)
  const price = Math.min(...prices)

  return {
    price,
    priceMax: isSolidMatch(input, level, closest)
      ? null
      : Math.max(...prices, Math.round(price * RANGE_MARGIN)),
    matchLevel: level,
    confidence: confidenceOf(level, closest.length),
    sampleSize: closest.length,
    poolSize: pool.length,
    closest: closest.map((e) => ({ brand: e.bl, model: e.ml, year: e.y, price: e.p })),
  }
}

/**
 * Do we actually have this car on record, or are we reasoning by analogy? Only a
 * same-model quote from a nearby year counts; a Fiesta 2005 does not price a Fiesta 2015,
 * which is a different generation with a different clutch job.
 *
 * An unknown year on either side fails the gate: without it we cannot tell the two apart.
 */
function isSolidMatch(input: PriceLookupInput, level: MatchLevel, closest: Example[]): boolean {
  if (level !== 'model' || !closest.length) return false
  const nearest = closest[0]
  if (!input.year || !nearest.y) return false
  return Math.abs(input.year - nearest.y) <= SOLID_YEAR_GAP
}
