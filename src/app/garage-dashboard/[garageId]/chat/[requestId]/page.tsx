import ChatPage from './components/ChatPage'

interface PageProps {
  params: Promise<{
    garageId: string
    requestId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { garageId, requestId } = await params
  return <ChatPage garageId={garageId} requestId={requestId} />
}


