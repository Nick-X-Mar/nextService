/**
 * Leave-one-out check of the price lookup against its own dataset.
 *
 * Usage:
 *   npx tsx scripts/validate-price-lookup.ts
 *
 * For every past job we hide it from the dataset, ask the lookup what it would have
 * quoted for that exact car, and compare against what the garages actually said. Run it
 * after regenerating src/data/price-examples.json to see whether the change helped.
 */
import { EXAMPLES, lookupPriceIn, type MatchLevel } from '../src/lib/price-lookup'

interface Bucket { n: number; errors: number[]; under: number; over: number }

const newBucket = (): Bucket => ({ n: 0, errors: [], under: 0, over: 0 })
const byLevel = new Map<MatchLevel | 'none', Bucket>()
const byCategory = new Map<string, Bucket>()

function record(map: Map<string, Bucket>, key: string, err: number, ratio: number) {
  if (!map.has(key)) map.set(key, newBucket())
  const b = map.get(key)!
  b.n++
  b.errors.push(err)
  if (ratio < 0.75) b.under++
  if (ratio > 1.5) b.over++
}

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
  })

  if (!result) {
    record(byLevel as Map<string, Bucket>, 'none', 1, 1)
    continue
  }
  const ratio = result.price / target.p
  const err = Math.abs(result.price - target.p) / target.p
  record(byLevel as Map<string, Bucket>, result.matchLevel, err, ratio)
  record(byCategory, target.c, err, ratio)
}

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b)
  if (!s.length) return 0
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

function line(key: string, b: Bucket): string {
  const within25 = b.errors.filter((e) => e <= 0.25).length
  return (
    `  ${key.padEnd(14)} n=${String(b.n).padStart(3)}  ` +
    `διάμεσο σφάλμα ${(median(b.errors) * 100).toFixed(0).padStart(3)}%  ` +
    `εντός ±25%: ${((within25 / b.n) * 100).toFixed(0).padStart(3)}%  ` +
    `υποεκτίμηση >25%: ${String(b.under).padStart(3)}  υπερεκτίμηση >50%: ${String(b.over).padStart(3)}`
  )
}

console.log(`Leave-one-out σε ${EXAMPLES.length} παραδείγματα\n`)
console.log('Ανά επίπεδο ταιριάσματος:')
for (const level of ['model', 'brand', 'engine', 'category', 'none'] as const) {
  const b = (byLevel as Map<string, Bucket>).get(level)
  if (b) console.log(line(level, b))
}
console.log('\nΑνά κατηγορία:')
for (const [cat, b] of [...byCategory.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(line(cat, b))
}

const all = [...byCategory.values()].flatMap((b) => b.errors)
console.log(
  `\nΣύνολο: διάμεσο σφάλμα ${(median(all) * 100).toFixed(0)}%, ` +
  `εντός ±25% το ${((all.filter((e) => e <= 0.25).length / all.length) * 100).toFixed(0)}%`
)
