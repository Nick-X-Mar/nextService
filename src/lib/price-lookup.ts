/**
 * Price estimation by lookup, not by formula.
 *
 * We only quote a number when the same car is already in our history: same brand and
 * model, within a year of the same age, and — for anything the engine touches — the same
 * fuel, roughly the same cc, and the same turbo/4x4 configuration. Anything short of that
 * returns null and the customer sees no estimate at all, because a clutch on a 1.4 petrol
 * says nothing about the same badge with a 2.0 diesel turbo.
 *
 * The dataset is src/data/price-examples.json, regenerated from the offers spreadsheet
 * with `npx tsx scripts/build-price-examples.ts`.
 */
import dataset from '@/data/price-examples.json'

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

export interface PriceLookupResult {
  /** The lowest price among the matching past jobs — the "από" figure, and the only one shown. */
  price: number
  /** How many past jobs matched. */
  sampleSize: number
  /** Model years those jobs covered — within YEAR_TOLERANCE of what was asked. */
  yearFrom: number
  yearTo: number
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

/**
 * How far apart the two model years may be. One year covers a facelift and the way people
 * misremember a registration date; two would start spanning generations, which is where a
 * 200€ clutch turns into an 800€ one.
 */
const YEAR_TOLERANCE = 1

/**
 * How far apart the two engine sizes may be. This absorbs rounding — a 1598cc engine is
 * typed in as "1600" — and nothing else: 1.4 and 1.6 stay different engines.
 */
const CC_TOLERANCE = 150

/**
 * Categories where the engine has nothing to do with the job, so the strict engine gate
 * would only reject good matches. The vehicle form does not even ask for cc, fuel, turbo
 * or drivetrain on these — see `isBodywork` in CarBrandModelSelector.
 */
const ENGINE_IRRELEVANT = new Set(['oliki-vafi', 'meriki-vafi', 'fanopeia'])

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

/**
 * Same car on the badge. The sheet writes trim levels into the model ("qashqai J10",
 * "astra G"), so a bare "Qashqai" still has to find them; 3+ chars keeps C3 out of C30.
 */
function sameModel(brand: string, model: string, e: Example): boolean {
  if (!brand || !model || e.b !== brand) return false
  if (e.m === model) return true
  return model.length >= 3 && e.m.length >= 3 && (e.m.startsWith(model) || model.startsWith(e.m))
}

/**
 * Same engine doing the same job. Every attribute has to be known on both sides — an
 * example with no fuel recorded cannot prove it was a diesel, so it does not get to price
 * one.
 */
function sameEngine(input: PriceLookupInput, e: Example): boolean {
  if (!input.fuel || !e.f || input.fuel !== e.f) return false
  if (!input.cc || !e.cc || Math.abs(input.cc - e.cc) > CC_TOLERANCE) return false
  if (!!input.is4x4 !== !!e.x4) return false
  if (!!input.isTurbo !== !!e.tb) return false
  return true
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
  if (!input.year) return null

  const brand = canonBrand(input.brand)
  const model = normalize(input.model || '')
  const engineMatters = !ENGINE_IRRELEVANT.has(input.category)

  const matched = examples.filter((e) => {
    if (e.c !== input.category) return false
    if (!sameModel(brand, model, e)) return false
    if (e.y == null || Math.abs(input.year! - e.y) > YEAR_TOLERANCE) return false
    return engineMatters ? sameEngine(input, e) : true
  })

  if (!matched.length) return null

  // Every match is the same car, so the cheapest of them is the floor we can promise.
  const years = matched.map((e) => e.y!)
  return {
    price: Math.min(...matched.map((e) => e.p)),
    sampleSize: matched.length,
    yearFrom: Math.min(...years),
    yearTo: Math.max(...years),
  }
}
