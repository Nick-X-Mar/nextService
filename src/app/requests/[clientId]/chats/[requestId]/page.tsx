import { Suspense } from 'react'
import IndividualChatPage from './components/IndividualChatPage'

interface PageProps {
  params: Promise<{
    clientId: string
    requestId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { clientId, requestId } = await params
  // Local boundary: IndividualChatPage reads ?garageId= via useSearchParams().
  return (
    <Suspense fallback={<div className="app-viewport bg-surface" />}>
      <IndividualChatPage clientId={clientId} requestId={requestId} />
    </Suspense>
  )
}

export const metadata = {
  title: 'Συνομιλία - NextService',
  description: 'Συνομιλία με το συνεργείο',
}
