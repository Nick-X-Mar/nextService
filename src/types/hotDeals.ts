export interface HotDeal {
  dealId: string
  title: string
  subtitle: string
  description: string
  price: string
  priceNum: number
  image: string        // S3 URL or static path
  icon: string         // Material Symbols icon name
  details: string[]    // "Τι περιλαμβάνει" items
  duration: string
  category: string
  workType: string
  slug: string
  popular: boolean
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}
