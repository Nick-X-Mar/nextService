import RequestsPage from '../components/RequestsPage'

interface PageProps {
  params: Promise<{
    clientId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { clientId } = await params
  return <RequestsPage clientId={clientId} />
}

export const metadata = {
  title: 'Αιτήματα Υπηρεσιών - NextService',
  description: 'Δείτε όλα τα αιτήματα υπηρεσιών που έχετε κάνει',
}
