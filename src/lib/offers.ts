import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB } from '@/utils/dynamoService'
import { ensureHotDealsTable, HOT_DEALS_TABLE_NAME } from '@/utils/ensureHotDealsTable'
import staticOffers from '@/data/offers.json'

export interface Offer {
  id?: string
  dealId?: string
  slug: string
  image: string
  title: string
  subtitle: string
  description: string
  details: string[]
  price: string
  priceNum: number
  category: string
  workType: string
  duration: string
  icon: string
  popular?: boolean
  isActive?: boolean
  sortOrder?: number
}

export async function getAllOffers(): Promise<Offer[]> {
  try {
    await ensureHotDealsTable()
    const result = await dynamoDB.send(
      new ScanCommand({
        TableName: HOT_DEALS_TABLE_NAME,
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: { ':active': true },
      })
    )
    const items = (result.Items as Offer[] | undefined) ?? []
    if (items.length > 0) {
      return items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    }
  } catch {
    // fall through to static fallback
  }
  return staticOffers as Offer[]
}

export async function getOfferBySlug(slug: string): Promise<Offer | null> {
  const all = await getAllOffers()
  return all.find((o) => o.slug === slug) ?? null
}
