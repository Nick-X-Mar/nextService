import ClientChatsPage from './components/ClientChatsPage'

interface PageProps {
  params: Promise<{
    clientId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { clientId } = await params
  return <ClientChatsPage clientId={clientId} />
}

export const metadata = {
  title: 'Συνομιλίες - NextService',
  description: 'Δείτε όλες τις συνομιλίες σας με τα συνεργεία',
}
