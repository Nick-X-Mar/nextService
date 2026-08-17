/**
 * Leave-one-out check of the price lookup against its own dataset.
 *
 * Usage:
 *   npx tsx scripts/validate-price-lookup.ts
 *
 * For every past job we hide it from the dataset, ask the lookup what it would have
 * quoted for that exact car, and compare against what the garages actually said. Since
 * the lookup only answers when it finds the same car, there are two numbers to watch:
 * κάλυψη (how often we say anything at all) and, of those, how far off the floor was.
 * Run it after regenerating src/data/price-examples.json to see whether a change helped.
 */
import { EXAMPLES, lookupPriceIn } from '../src/lib/price-lookup'

interface Bucket { n: number; covered: number; errors: number[]; under: number }

const newBucket = (): Bucket => ({ n: 0, covered: 0, errors: [], under: 0 })
const byCategory = new Map<string, Bucket>()

for (let i = 0; i < EXAMPLES.length; i++) {
  const target = EXAMPLES[i]
  const rest = EXAMPLES.filter((_, j) => j !== i)
  const result = lookupPriceIn(rest, {
    category: target.c,
    brand: target.bl,
    model: target.ml,
    year: target.y,
    cc: target.cc,
    fuel: target.f,
    is4x4: target.x4,
    isTurbo: target.tb,
  })

  if (!byCategory.has(target.c)) byCategory.set(target.c, newBucket())
  const b = byCategory.get(target.c)!
  b.n++
  if (!result) continue

  b.covered++
  b.errors.push(Math.abs(result.price - target.p) / target.p)
  // The floor came in well under what the garage actually charged — the "από 200€"
  // that turns into a 400€ invoice, which is the failure mode worth counting.
  if (result.price / target.p < 0.75) b.under++
}

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b)
  if (!s.length) return 0
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

function line(key: string, b: Bucket): string {
  const within25 = b.errors.filter((e) => e <= 0.25).length
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)
  return (
    `  ${key.padEnd(14)} n=${String(b.n).padStart(3)}  ` +
    `κάλυψη ${String(pct(b.covered, b.n)).padStart(3)}%  ` +
    `διάμεσο σφάλμα ${String(Math.round(median(b.errors) * 100)).padStart(3)}%  ` +
    `εντός ±25%: ${String(pct(within25, b.errors.length)).padStart(3)}%  ` +
    `υποεκτίμηση >25%: ${String(b.under).padStart(3)}`
  )
}

console.log(`Leave-one-out σε ${EXAMPLES.length} παραδείγματα\n`)
console.log('Ανά κατηγορία:')
for (const [cat, b] of [...byCategory.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(line(cat, b))
}

const total = [...byCategory.values()].reduce(
  (acc, b) => ({
    n: acc.n + b.n,
    covered: acc.covered + b.covered,
    errors: [...acc.errors, ...b.errors],
    under: acc.under + b.under,
  }),
  newBucket()
)
console.log(`\n${line('ΣΥΝΟΛΟ', total)}`)
console.log(
  `\nΣε ${total.n - total.covered} από ${total.n} περιπτώσεις δεν βρέθηκε ίδιο αυτοκίνητο ` +
  `και δεν θα εμφανιζόταν καθόλου εκτίμηση.`
)
