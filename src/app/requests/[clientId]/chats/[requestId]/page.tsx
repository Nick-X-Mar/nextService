import IndividualChatPage from './components/IndividualChatPage'

interface PageProps {
  params: Promise<{
    clientId: string
    requestId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { clientId, requestId } = await params
  return <IndividualChatPage clientId={clientId} requestId={requestId} />
}

export const metadata = {
  title: 'Συνομιλία - NextService',
  description: 'Συνομιλία με το συνεργείο',
}
