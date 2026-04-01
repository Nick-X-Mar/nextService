import offersData from '@/data/offers.json'
import { notFound } from 'next/navigation'
import OfferDetailPage from './components/OfferDetailPage'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function OfferPage({ params }: PageProps) {
  const { slug } = await params
  const offer = offersData.find((o) => o.slug === slug)

  if (!offer) {
    notFound()
  }

  return <OfferDetailPage offer={offer} />
}

export async function generateStaticParams() {
  return offersData.map((offer) => ({
    slug: offer.slug,
  }))
}
