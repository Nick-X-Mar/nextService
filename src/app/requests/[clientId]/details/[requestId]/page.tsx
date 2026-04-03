import RequestDetailsPage from './RequestDetailsPage'

interface PageProps {
  params: Promise<{
    clientId: string
    requestId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { clientId, requestId } = await params
  return <RequestDetailsPage clientId={clientId} requestId={requestId} />
}

export const metadata = {
  title: 'Λεπτομέρειες Αιτήματος - NextService',
  description: 'Δείτε τις λεπτομέρειες του αιτήματός σας',
}
