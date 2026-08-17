/**
 * Build the price-estimation dataset out of the hand-kept offers spreadsheets.
 *
 * Usage:
 *   npx tsx scripts/build-price-examples.ts                       # both default CSVs
 *   npx tsx scripts/build-price-examples.ts path/to/export.csv    # explicit export(s)
 *   npx tsx scripts/build-price-examples.ts --report              # print what was dropped and why
 *   npx tsx scripts/build-price-examples.ts --dump                # print every example that survived
 *   npx tsx scripts/build-price-examples.ts --years=5             # widen the recency window
 *
 * Writes src/data/price-examples.json — the lookup table used by /api/price-estimation.
 * Safe to re-run whenever a sheet grows; the output is fully regenerated.
 *
 * Two sheet layouts are read and merged:
 *
 *   structured — "Προσφορές": one column per vehicle field (Μάρκα, Μοντέλο, Κυβικά…).
 *                Runs to today, but the columns are shifted on many rows and a good
 *                number of them have the whole car dumped into the Μάρκα cell.
 *   freeform   — "Φύλλο37": the car is one free-text cell ("Peugeot 206 2006 69… Βάρβαρα").
 *                Ends Jun-2025 but covers the 2024 back-catalogue far more densely.
 *
 * They overlap by roughly 600 jobs, so rows are deduped on phone + category and the
 * better-populated of the two copies wins.
 *
 * The quote text itself is free text ("Είπα 250€", "Ηλίας: €250", "Δημήτρης: 300€ συν
 * ΦΠΑ"), so price extraction stays heuristic and deliberately conservative — a dropped
 * row costs us one example, a mis-parsed row poisons every future estimate for that model.
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const DEFAULT_CSVS = ['NextService - Προσφορές Last.csv', 'NextService - Φύλλο37.csv']
const OUT = resolve(process.cwd(), 'src/data/price-examples.json')
const VAT = 1.24

const args = process.argv.slice(2)
const REPORT = args.includes('--report')
const DUMP = args.includes('--dump')
const explicit = args.filter((a) => !a.startsWith('--'))
const CSV_PATHS = (explicit.length ? explicit : DEFAULT_CSVS).map((p) => resolve(process.cwd(), p))

/** Only quotes from the last N years are kept — older ones price a different market. */
const YEARS_WINDOW = parseInt(args.find((a) => a.startsWith('--years='))?.split('=')[1] || '3', 10)
const CUTOFF = new Date()
CUTOFF.setFullYear(CUTOFF.getFullYear() - YEARS_WINDOW)

// ─────────────────────────────────────────────────────────── CSV

/** RFC4180 parser — the sheets have quoted fields with embedded newlines and commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false }
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim()))
}

// ─────────────────────────────────────────────────────────── normalisation

const deaccent = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Strip accents, lowercase, and fold the Greek letters typed in place of latin ones. */
function normalize(s: string): string {
  let out = deaccent(s).trim()
  const greek = 'αβγδεζηικλμνοπρστυφχω'
  const latin = 'avgdeziiklmnoprstyfxo'
  out = [...out].map((ch) => { const i = greek.indexOf(ch); return i === -1 ? ch : latin[i] }).join('')
  return out.replace(/[^a-z0-9]/g, '')
}

const BRAND_ALIASES: Record<string, string> = {
  vw: 'volkswagen', wv: 'volkswagen', vwolkswagen: 'volkswagen',
  scoda: 'skoda', sccoda: 'skoda', skota: 'skoda',
  mercedesbenz: 'mercedes', merchedes: 'mercedes', mersedes: 'mercedes',
  landrover: 'land', alfaromeo: 'alfa', alfarome: 'alfa',
  citroem: 'citroen', citroe: 'citroen', citron: 'citroen',
  hyndai: 'hyundai', huyndai: 'hyundai', hiundai: 'hyundai', hiyndai: 'hyundai',
  peugot: 'peugeot', pegeute: 'peugeot', pegeuot: 'peugeot', pegeout: 'peugeot',
  peugeute: 'peugeot', pegugeote: 'peugeot', peugeots: 'peugeot', pegeuote: 'peugeot',
  reno: 'renault', toyta: 'toyota', toyoya: 'toyota',
  mitshubishi: 'mitsubishi', mitshubisi: 'mitsubishi', mitsubisi: 'mitsubishi',
  daihatshun: 'daihatsu', daewood: 'daewoo', deadwood: 'daewoo',
  porch: 'porsche', porshe: 'porsche', honta: 'honda', set: 'seat',
  // Rows typed in Greek capitals fold to these once the alphabet is transliterated.
  vmw: 'bmw',
}
const canonBrand = (s: string) => { const n = normalize(s); return BRAND_ALIASES[n] || n }

/** Model strings drift ("astra-G", "astraG", "Astra G") — collapse to bare letters. */
const canonModel = (s: string) => normalize(s).replace(/^(the|to)/, '')

// ─────────────────────────────────────────────────────────── free-text vehicle parsing

/**
 * The freeform sheet writes the whole car into one cell, and so do a fair number of rows
 * in the structured sheet where the typist skipped past the Μάρκα column:
 *
 *   "Fiat Grande punto 1400 2008 βενζίνη υγραέριο turbo P5:198A4000 6972272603 Γιώργος"
 *   "Opel astra G 1389 11/2003 βενζίνη απλό Z14XE Μοσχοπέας 6944286734 Παπάγου"
 *
 * The shape is stable: brand, model, then engine size before year, then fuel and the
 * usual free text. Everything after the first phone number is a person, not a car.
 */
const KNOWN_BRANDS = new Set([
  'abarth', 'alfa', 'audi', 'bmw', 'cadillac', 'chevrolet', 'chrysler', 'citroen', 'cupra',
  'dacia', 'daewoo', 'daihatsu', 'dodge', 'ds', 'fiat', 'ford', 'honda', 'hummer', 'hyundai',
  'infiniti', 'isuzu', 'iveco', 'jaguar', 'jeep', 'kia', 'lada', 'lancia', 'land', 'lexus',
  'mazda', 'mercedes', 'mg', 'mini', 'mitsubishi', 'nissan', 'opel', 'peugeot', 'porsche',
  'renault', 'rover', 'saab', 'seat', 'skoda', 'smart', 'ssangyong', 'subaru', 'suzuki',
  'tesla', 'toyota', 'volkswagen', 'volvo',
])

/** A handful of rows open with the model instead of the badge. */
const MODEL_TO_BRAND: Record<string, string> = {
  golf: 'volkswagen', polo: 'volkswagen', yaris: 'toyota', auris: 'toyota', rav: 'toyota',
  corolla: 'toyota', focus: 'ford', fiesta: 'ford', mito: 'alfa', julieta: 'alfa',
  tuson: 'hyundai', astra: 'opel', corsa: 'opel', clio: 'renault', punto: 'fiat',
}

/** Badges that are bare numbers big enough to be mistaken for an engine size or a year. */
const NUMERIC_MODELS: Record<string, Set<string>> = {
  peugeot: new Set(['1007', '2008', '3008', '4007', '4008', '5008']),
}

/** Words that end the model and start the spec block. */
const SPEC_WORD = /^(βενζιν|πετρελ|diesel|ντιζελ|υγραερ|lpg|υβριδ|hybrid|mild|ηλεκτρ|electric|turbo|τουρμπο|tdi|tfsi|tsi|hdi|cdi|dci|crdi|4x4|4χ4|awd|quattro|τετρακιν|απλο|αυτοματ|ημιαυτοματ|χειροκινητ|φυσικο|αεριο|ταχυτητ|ταχυτητες|μοντελο|model|κυβικ|hp|ps|με|και|η|το|τα)/

const FUELS: [RegExp, string][] = [
  [/πετρελ|diesel|ντιζελ|dci|tdi|hdi|cdi|crdi|bluehdi/, 'diesel'],
  [/βενζιν|βανζιν|petrol|tfsi|tsi/, 'petrol'],
  [/υγραερι|lpg|φυσικο αεριο|αεριο/, 'lpg'],
  [/υβριδ|hybrid/, 'hybrid'],
  [/ηλεκτρ|electric/, 'ev'],
]

const PHONE = /\b(?:(?:\+?30)?\s*69\d{8}|2\d{9})\b/
const THIS_YEAR = new Date().getFullYear()
const isYear = (n: number) => n >= 1980 && n <= THIS_YEAR + 1
const isCc = (n: number) => n >= 500 && n <= 6500

interface Vehicle {
  brand: string
  model: string
  cc: number | null
  year: number | null
  fuel: string | null
  turbo: boolean
  is4x4: boolean
}

function parseVehicleText(text: string): Vehicle | null {
  const raw = (text || '').trim()
  if (!raw) return null

  // Anything past the first phone number is the customer, their area and our own notes.
  const phoneAt = raw.search(PHONE)
  const carPart = phoneAt > 0 ? raw.slice(0, phoneAt) : raw
  const flatAll = deaccent(raw)

  // "ΟΠΕΛ-ΜΕΡΙΒΑ" and "golf-5" both split cleanly on the dash.
  const tokens = carPart.split(/[\s,/\-–]+/).map((t) => t.trim()).filter(Boolean)
  if (!tokens.length) return null

  let brand = ''
  let i = 0
  for (; i < Math.min(tokens.length, 3); i++) {
    const c = canonBrand(tokens[i])
    if (KNOWN_BRANDS.has(c)) { brand = c; break }
    if (MODEL_TO_BRAND[c]) { brand = MODEL_TO_BRAND[c]; break }
  }
  if (!brand) return null
  // A model used as the badge ("Golf 1400 2006") is also the model — don't skip past it.
  const startedOnModel = !KNOWN_BRANDS.has(canonBrand(tokens[i]))
  const brandLabel = startedOnModel ? brand[0].toUpperCase() + brand.slice(1) : tokens[i]
  i += startedOnModel ? 0 : 1

  // "Alfa Romeo 156", "Land Rover freelander" — the second word belongs to the badge.
  if (!startedOnModel && (brand === 'alfa' || brand === 'land') && tokens[i] &&
      /^(romeo|rover)$/i.test(deaccent(tokens[i]))) i++

  // Plenty of badges are bare numbers ("206", "500", "156", "451"), so the token right
  // after the brand is normally taken as the model whatever it looks like. The exception
  // is a row that names no model at all — "Hyundai 1200 2008", "Smart 2018" — where that
  // number is the engine or the year and swallowing it invents a model out of nothing.
  const trailing = tokens.slice(i + 1)
    .map((t) => t.match(/^(\d{3,4})$/)?.[1]).filter(Boolean).map(Number)
  const bare = tokens[i]?.match(/^(\d{3,4})$/)?.[1]
  if (bare && !NUMERIC_MODELS[brand]?.has(bare)) {
    const n = parseInt(bare, 10)
    // Under 800cc is a Smart or a kei car, so a smaller number is always a badge.
    const isEngineThenYear = n >= 800 && isCc(n) && trailing.length === 1 && isYear(trailing[0])
    const isLoneYear = isYear(n) && !trailing.length
    if (isEngineThenYear || isLoneYear) {
      return finishVehicle(brandLabel, '', tokens.slice(i), carPart, flatAll)
    }
  }

  // The model runs until the spec block: a 3-4 digit number, a fuel/drivetrain word, or
  // an obvious engine/VIN code.
  const model: string[] = []
  for (; i < tokens.length; i++) {
    const t = tokens[i]
    const flat = deaccent(t)
    if (model.length) {
      if (/^\d{3,}$/.test(t) || SPEC_WORD.test(flat)) break
      if (/^\d/.test(t) && /[a-zα-ω]/i.test(t)) break     // "1.6bluehdi", "120hp"
      if (t.length > 3 && /\d/.test(t) && /[A-Z]/.test(t)) break // engine / VIN codes
      if (model.length >= 3) break
    }
    model.push(t)
  }
  return finishVehicle(brandLabel, model.join(' '), tokens.slice(i), carPart, flatAll)
}

/** Engine size, year, fuel and drivetrain out of whatever follows the badge. */
function finishVehicle(
  brandLabel: string, model: string, rest: string[], carPart: string, flatAll: string
): Vehicle {

  // Engine size is written before the year on effectively every row, so read them
  // positionally instead of guessing per number — "BMW 320i 2000 2008" is a 2.0 from 2008.
  const numbers: number[] = []
  for (const t of rest) {
    const m = t.match(/^(\d{3,4})$/)
    if (m) { numbers.push(parseInt(m[1], 10)); continue }
    const withUnit = deaccent(t).match(/^(\d{3,4})(?:cc|κυβ|κε)/)
    if (withUnit) numbers.push(parseInt(withUnit[1], 10))
  }
  let cc: number | null = null
  let year: number | null = null
  for (const n of numbers) {
    if (cc === null && year === null && isCc(n) && numbers.length > 1) { cc = n; continue }
    if (year === null && isYear(n)) { year = n; continue }
    if (cc === null && isCc(n)) cc = n
  }
  // A lone number is a year far more often than a displacement ("Toyota Yaris 2000").
  if (cc !== null && year === null && numbers.length === 1 && isYear(cc)) { year = cc; cc = null }

  // Dates are also written "11/2003" or "αρχές/2009", which the token split above broke up.
  if (year === null) {
    const slashed = carPart.match(/(?:^|\D)(?:\d{1,2}\s*[/.]\s*)?(19\d{2}|20[0-2]\d)(?!\d)/)
    if (slashed && isYear(parseInt(slashed[1], 10))) year = parseInt(slashed[1], 10)
  }

  let fuel: string | null = null
  for (const [re, f] of FUELS) if (re.test(flatAll)) { fuel = f; break }

  return {
    brand: brandLabel,
    model,
    cc,
    year,
    fuel,
    turbo: /turbo|τουρμπο|tfsi|tsi|tdi|hdi|cdi|dci|crdi/.test(flatAll),
    is4x4: /4x4|4χ4|4wd|awd|quattro|τετρακιν/.test(flatAll),
  }
}

// ─────────────────────────────────────────────────────────── category mapping

/** Sheet job description → the category slug the app actually sends. */
const JOB_TO_CATEGORY: [RegExp, string][] = [
  // Both sheets label bodywork explicitly, so trust the label before anything else — a
  // full respray and a painted bumper are different products (~1300€ vs ~130€).
  [/ολικ\w*\s*βαφ/, 'oliki-vafi'],
  [/μερικ\w*\s*βαφ/, 'meriki-vafi'],
  [/συμπλεκτ|διαφορικ/, 'symplektis'],
  [/ιμαντ|χρονισμ/, 'imantas'],
  [/αισθητηρ/, 'aisthitires'],
  [/λαδι/, 'allagi-ladion'],
  [/aircondition|air condition|κλιματισμ|a\/c/, 'aircondition'],
  [/service|σερβις|συντηρησ/, 'service'],
  [/φρεν|δισκοπλακ|τακακ/, 'brakes'],
  // Only the unlabelled "Φανοποιεία"/"Βαφή" rows still need the price to be split.
  [/φανοποι|βαφ|λαμαρ/, '__bodywork__'],
]

/**
 * Inside unlabelled bodywork: whole-car job or a single panel? The price carries most of
 * the signal — only unambiguous wording overrides it ("εξωτερικά" shows up in panel jobs
 * too, e.g. "χωρίς ξεμοντάρισμα εξωτερικά 100€").
 */
const FULL_RESPRAY = /ολικ|αλλαγη χρωμ|μεσα εξω/
const BODYWORK_SPLIT = 600

/** Category from the job label alone; null when the label is unknown to the app. */
function categoryOf(job: string): string | null {
  const j = normalize(job.replace(/\s+/g, ' '))
  const jSpaced = deaccent(job)
  for (const [re, cat] of JOB_TO_CATEGORY) if (re.test(jSpaced) || re.test(j)) return cat
  return null
}

function splitBodywork(text: string, price: number): string {
  if (price >= BODYWORK_SPLIT) return 'oliki-vafi'
  // Rows often quote both jobs ("ουρανός 130€ … ολική 1200€"); the extracted price
  // belongs to the first one, so the keyword only decides inside the grey band.
  return price >= 400 && FULL_RESPRAY.test(deaccent(text)) ? 'oliki-vafi' : 'meriki-vafi'
}

// ─────────────────────────────────────────────────────────── price extraction

/**
 * Each quote line belongs to one garage ("Δημήτρης: 300€ συν ΦΠΑ", "Ηλίας: €250"). Within
 * a line the FIRST amount is the answer to the job we asked about; anything after it is an
 * add-on ("και λάδια 40€", "συν 30€"). Taking the minimum of the whole line is what
 * produced the 15€ and 30€ garbage in the raw data, so we anchor on the first amount.
 */
const NUM = String.raw`\d{1,3}(?:\.\d{3})+|\d+(?:,\d{1,2})?`
const CURRENCY = String.raw`€|ευρω|ευρώ|eur\b`
/** Both orders occur: the structured sheet writes "250€", the freeform one "€250". */
const AMOUNT = new RegExp(String.raw`(?:(${NUM})\s*(?:${CURRENCY})|(?:${CURRENCY})\s*(${NUM}))`, 'i')
/** "450-500€", "230 με 250€" — quote the low end, it is the number we surface anyway. */
const RANGE = /(\d{2,4})\s*(?:-|–|—|με|εως|ή|η)\s*(\d{2,4})\s*(?:€|ευρω)/
const RANGE_PRE = /(?:€|ευρω)\s*(\d{2,4})\s*(?:-|–|—|με|εως|ή|η)\s*(\d{2,4})\b/
const AMOUNT_BARE = /(?:ειπα|ειπε|λεει|τιμη|κοστ|προσφορ|χρεωσ|συνολο|ολα|ολοι|εκλεισα)\D{0,15}?(\d{2,4})\b/i
const TOTAL = /=\s*(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:€|ευρω|ευρώ)?/
/** A leading add-on keyword means the first amount is not our job. */
const OTHER_JOB = /^[^0-9]{0,40}?(λαδι|σερβις|service|φιλτρ|βαλβολιν|φρεν|τακακ|ευθυγραμμ|ελαστικ|μπαταρι|ταπετσαρ)/
/** …unless the add-on keyword IS the job we asked about. */
const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  'allagi-ladion': /λαδι|φιλτρ|βαλβολιν/,
  service: /σερβις|service|λαδι|φιλτρ/,
  brakes: /φρεν|τακακ|δισκοπλακ/,
  elastika: /ελαστικ|ευθυγραμμ/,
}
const REFUSAL = /^\s*(οχι|oxi|δεν|ακυρ|-|—)\s*$/

function toNumber(raw: string): number | null {
  const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** One candidate price per garage line, VAT-normalised to what the customer pays. */
function extractCandidates(text: string, category: string | null): number[] {
  const own = category ? CATEGORY_KEYWORDS[category] : undefined
  const out: number[] = []

  for (const rawLine of (text || '').split(/[\n|]/)) {
    const line = rawLine.trim()
    if (!line || REFUSAL.test(deaccent(line))) continue

    // Strip the garage name prefix so "Δημήτρης: 300€" and "300€" behave the same.
    const body = line.replace(/^[^:€\d]{0,20}:\s*/, '')
    const flat = deaccent(body)
    if (OTHER_JOB.test(flat) && !own?.test(flat)) continue

    // "280€ συν 40€ συν 30€ = 350€" — the sheet already did the maths for us.
    let value: number | null = null
    const total = body.match(TOTAL)
    if (total) value = toNumber(total[1])
    if (value === null) {
      const range = flat.match(RANGE) || flat.match(RANGE_PRE)
      if (range) value = toNumber(range[1])
    }
    if (value === null) {
      const m = body.match(AMOUNT)
      if (m) value = toNumber(m[1] ?? m[2])
    }
    if (value === null) {
      const m = flat.match(AMOUNT_BARE)
      if (m) value = toNumber(m[1])
    }
    if (value === null || value < 15 || value > 8000) continue

    if (/φπα/.test(flat) && !/με\s*φπα|συμπ\w*\s*φπα/.test(flat)) value *= VAT
    out.push(Math.round(value))
  }
  return out
}

// ─────────────────────────────────────────────────────────── quote date

/** The sheets write dates as "Πέμπτη, 27 Ιουν 2024". */
const GREEK_MONTHS: Record<string, number> = {
  ιαν: 0, φεβ: 1, μαρ: 2, απρ: 3, μαι: 4, μαϊ: 4, ιουν: 5,
  ιουλ: 6, αυγ: 7, σεπ: 8, οκτ: 9, νοε: 10, δεκ: 11,
}

function quoteDate(cell: string): Date | null {
  const m = (cell || '').match(/(\d{1,2})\s+([Α-Ωα-ωΆ-ώΪΫϊϋΐΰ]+)\s+(\d{4})/)
  if (!m) return null
  // Ιουν / Ιουλ share a 3-letter prefix, so try 4 characters before falling back to 3.
  const name = deaccent(m[2])
  const month = GREEK_MONTHS[name.slice(0, 4)] ?? GREEK_MONTHS[name.slice(0, 3)]
  if (month === undefined) return null
  return new Date(parseInt(m[3], 10), month, parseInt(m[1], 10))
}

// ─────────────────────────────────────────────────────────── structured-sheet salvage

/**
 * In the structured sheet columns 5-15 are shifted per row (it was filled by hand), so
 * cc / year / fuel are recovered by scanning the block rather than by position.
 */
function salvageVehicle(cells: string[]) {
  let cc: number | null = null
  let year: number | null = null
  let fuel: string | null = null
  let turbo = false
  let is4x4 = false

  for (const cell of cells) {
    const flat = deaccent(cell)
    if (/turbo|τουρμπο/.test(flat)) turbo = true
    if (/4x4|4χ4|τετρακιν|awd|quattro/.test(flat)) is4x4 = true
    if (!fuel) for (const [re, f] of FUELS) if (re.test(flat)) { fuel = f; break }

    const exact = cell.trim().match(/^(\d{3,4})$/)
    if (exact) {
      const n = parseInt(exact[1], 10)
      if (isYear(n)) { if (year === null) year = n }
      else if (isCc(n)) { if (cc === null) cc = n }
      continue
    }
    const withUnit = flat.match(/\b(\d{3,4})\s*(?:cc|κυβ)/)
    if (withUnit && cc === null) cc = parseInt(withUnit[1], 10)
  }
  return { cc, year, fuel, turbo, is4x4 }
}

// ─────────────────────────────────────────────────────────── row readers

interface Candidate {
  category: string
  brand: string
  model: string
  year: number | null
  cc: number | null
  fuel: string | null
  is4x4: boolean
  isTurbo: boolean
  price: number
  /** Dedup identity across the two sheets. */
  key: string
  source: string
}

const dropped: Record<string, number> = {}
const drop = (why: string) => { dropped[why] = (dropped[why] || 0) + 1 }

const phoneOf = (s: string) => (s.match(PHONE)?.[0] || '').replace(/\D/g, '').slice(-10)

/** Enough vehicle detail to beat the other sheet's copy of the same job. */
const completeness = (c: Candidate) =>
  (c.year ? 4 : 0) + (c.cc ? 3 : 0) + (c.model ? 2 : 0) + (c.fuel ? 1 : 0)

/**
 * Shared tail of both readers: pick the price, resolve the category and emit a candidate.
 * `job` is the sheet's own label, `quoteText` the per-garage quote column and `noteText`
 * the follow-up note, which carries the price we finally told the customer when the quote
 * columns are empty.
 */
function makeCandidate(
  job: string, vehicle: Vehicle | null, quoteText: string, noteText: string,
  identity: string, source: string
): Candidate | null {
  if (!vehicle || !vehicle.brand) { drop('χωρίς αναγνωρίσιμο όχημα'); return null }

  let category = categoryOf(job)
  if (!category) { drop(`άγνωστη κατηγορία: ${job.trim() || '(κενή)'}`); return null }

  const forSplit = category === '__bodywork__'
  let prices = extractCandidates(quoteText, forSplit ? null : category)
  if (!prices.length) prices = extractCandidates(noteText, forSplit ? null : category)
  if (!prices.length) { drop('χωρίς τιμή στο κείμενο'); return null }

  const price = Math.min(...prices)
  if (forSplit) category = splitBodywork(`${quoteText} ${noteText}`, price)

  return {
    category,
    brand: vehicle.brand.trim(),
    model: vehicle.model.trim(),
    year: vehicle.year,
    cc: vehicle.cc,
    fuel: vehicle.fuel,
    is4x4: vehicle.is4x4,
    isTurbo: vehicle.turbo,
    price,
    key: `${identity}|${category}`,
    source,
  }
}

/** "Προσφορές": A/A, Ημερομηνία, Εργασίες, Μάρκα, Μοντέλο, … */
function readStructured(rows: string[][], source: string): Candidate[] {
  const out: Candidate[] = []
  for (const r of rows) {
    const job = (r[2] || '').trim()
    const brandCell = (r[3] || '').trim()
    if (!job) { drop('χωρίς εργασία'); continue }

    // Undated rows are kept: nearly the whole sheet sits inside the window anyway, so a
    // missing date is far more likely to be a blank cell than a genuinely old quote.
    const date = quoteDate(r[1])
    if (date && date < CUTOFF) { drop(`παλαιότερο από ${YEARS_WINDOW} χρόνια`); continue }

    // A good number of rows have the whole car typed into the Μάρκα cell instead of split
    // across the columns; those parse with the freeform reader.
    const looksFreeform = /\s/.test(brandCell) && (/\d{3}/.test(brandCell) || brandCell.split(/\s+/).length > 2)
    let vehicle: Vehicle | null
    if (looksFreeform) {
      vehicle = parseVehicleText(brandCell)
    } else {
      const v = salvageVehicle(r.slice(5, 16))
      vehicle = brandCell ? { brand: brandCell, model: (r[4] || '').trim(), ...v } : null
    }

    const identity = phoneOf(r.join(' ')) ||
      `${date?.toISOString().slice(0, 10) || '?'}:${canonBrand(vehicle?.brand || '')}:${canonModel(vehicle?.model || '')}`
    const c = makeCandidate(job, vehicle, [r[18], r[19], r[20], r[21]].filter(Boolean).join('\n'), r[23] || '', identity, source)
    if (c) out.push(c)
  }
  return out
}

/** "Φύλλο37": Ημερομηνία, <κατηγορία>, Πελάτης, Συνεργείο, Προσφορά συνεργείων, Feedback, Επικοινωνία */
function readFreeform(rows: string[][], source: string): Candidate[] {
  const out: Candidate[] = []
  for (const r of rows) {
    const job = (r[1] || '').trim()
    if (!job) { drop('χωρίς εργασία'); continue }

    const date = quoteDate(r[0])
    if (date && date < CUTOFF) { drop(`παλαιότερο από ${YEARS_WINDOW} χρόνια`); continue }

    const vehicle = parseVehicleText(r[2] || '')
    const identity = phoneOf(r[2] || '') ||
      `${date?.toISOString().slice(0, 10) || '?'}:${canonBrand(vehicle?.brand || '')}:${canonModel(vehicle?.model || '')}`
    const c = makeCandidate(job, vehicle, r[4] || '', [r[5], r[6]].filter(Boolean).join('\n'), identity, source)
    if (c) out.push(c)
  }
  return out
}

// ─────────────────────────────────────────────────────────── build

const collected: Candidate[] = []
const sourceRows: Record<string, number> = {}

for (const path of CSV_PATHS) {
  const rows = parseCsv(readFileSync(path, 'utf-8'))
  const header = rows[0].map((h) => deaccent(h).trim())
  const body = rows.slice(1)
  const label = path.split('/').pop() || path
  sourceRows[label] = body.length

  if (header.includes('μαρκα')) collected.push(...readStructured(body, label))
  else if (header.includes('πελατης')) collected.push(...readFreeform(body, label))
  else throw new Error(`Άγνωστη μορφή στήλης στο ${label}: ${header.join(', ')}`)
}

// The two sheets share roughly 600 jobs. Keep the copy with the fuller vehicle record —
// neither sheet is consistently better, it depends on how that particular row was typed.
const merged = new Map<string, Candidate>()
for (const c of collected) {
  const existing = merged.get(c.key)
  if (!existing) { merged.set(c.key, c); continue }
  drop(`διπλοεγγραφή (${c.source})`)
  if (completeness(c) > completeness(existing)) merged.set(c.key, c)
}

// Outlier pass, deliberately asymmetric: we surface the *lowest* price of the closest
// examples, so one bad low row becomes the headline number for that model, while a bad
// high row is almost always masked by the two other neighbours. Cut low hard, keep the
// expensive tail — an 800€ wet-belt Ford is a real quote, not a parsing miss.
function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const byCategory = new Map<string, Candidate[]>()
for (const e of merged.values()) {
  if (!byCategory.has(e.category)) byCategory.set(e.category, [])
  byCategory.get(e.category)!.push(e)
}

const examples: Candidate[] = []
const bounds: Record<string, { lo: number; hi: number; med: number }> = {}
for (const [cat, list] of byCategory) {
  const med = median(list.map((e) => e.price))
  const lo = Math.round(med * 0.5)
  const hi = Math.round(med * 5)
  bounds[cat] = { lo, hi, med }
  for (const e of list) {
    if (e.price < lo || e.price > hi) { drop(`outlier ${cat} (${e.price}€, όρια ${lo}-${hi}€)`); continue }
    examples.push(e)
  }
}

examples.sort((a, b) =>
  a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand) ||
  a.model.localeCompare(b.model) || (a.year || 0) - (b.year || 0))

// Canonical keys are what the runtime lookup matches on — precompute them here so the
// API never pays for normalisation on the request path.
const payload = {
  generatedFrom: Object.keys(sourceRows),
  generatedRows: sourceRows,
  yearsWindow: YEARS_WINDOW,
  examples: examples.map((e) => ({
    c: e.category,
    b: canonBrand(e.brand),
    m: canonModel(e.model),
    bl: e.brand.trim(),
    ml: e.model.trim(),
    y: e.year,
    cc: e.cc,
    f: e.fuel,
    x4: e.is4x4 || undefined,
    tb: e.isTurbo || undefined,
    p: e.price,
  })),
}

writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`)

const totalRows = Object.values(sourceRows).reduce((a, b) => a + b, 0)
console.log(
  `Διαβάστηκαν ${totalRows} γραμμές από ${CSV_PATHS.length} φύλλα → ${examples.length} καθαρά ` +
  `παραδείγματα (προσφορές από ${CUTOFF.toISOString().slice(0, 10)} και μετά)\n`
)
console.log('Ανά κατηγορία:')
const finalByCat = new Map<string, Candidate[]>()
for (const e of examples) {
  if (!finalByCat.has(e.category)) finalByCat.set(e.category, [])
  finalByCat.get(e.category)!.push(e)
}
for (const [cat, list] of [...finalByCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const ps = list.map((e) => e.price).sort((a, b) => a - b)
  const models = new Set(list.map((e) => `${canonBrand(e.brand)} ${canonModel(e.model)}`)).size
  console.log(
    `  ${cat.padEnd(14)} n=${String(list.length).padStart(3)}  ` +
    `min=${ps[0]}€ διάμεσος=${median(ps)}€ max=${ps[ps.length - 1]}€  ` +
    `${models} μοντέλα  (όρια outlier ${bounds[cat].lo}-${bounds[cat].hi}€)`
  )
}
if (DUMP) {
  console.log('\nΠαραδείγματα:')
  for (const e of examples) {
    console.log(
      `  ${e.category.padEnd(14)} ${`${e.brand} ${e.model}`.padEnd(28)} ` +
      `${String(e.cc ?? '—').padStart(4)}cc ${String(e.year ?? '—').padStart(4)} ` +
      `${(e.fuel || '—').padEnd(7)}${e.isTurbo ? ' turbo' : ''}${e.is4x4 ? ' 4x4' : ''} → ${e.price}€`
    )
  }
}
if (REPORT) {
  console.log('\nΑπορρίφθηκαν:')
  for (const [why, n] of Object.entries(dropped).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${why}`)
  }
}
console.log(`\nΓράφτηκε: ${OUT}`)
