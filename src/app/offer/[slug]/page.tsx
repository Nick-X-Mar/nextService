import OfferDetailPage from './components/OfferDetailPage'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function OfferPage({ params }: PageProps) {
  const { slug } = await params

  return <OfferDetailPage slug={decodeURIComponent(slug)} />
}
