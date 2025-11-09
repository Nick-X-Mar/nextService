import OfferPage from './components/OfferPage'

interface OfferPageRouteProps {
  params: Promise<{
    garageId: string
    requestId: string
  }>
}

export default async function OfferPageRoute({ params }: OfferPageRouteProps) {
  const { garageId, requestId } = await params

  return (
    <OfferPage 
      garageId={garageId} 
      requestId={requestId} 
    />
  )
}


