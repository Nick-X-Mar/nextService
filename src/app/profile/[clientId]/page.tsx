import ProfilePage from './components/ProfilePage'

interface PageProps {
  params: Promise<{
    clientId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { clientId } = await params
  return <ProfilePage clientId={clientId} />
}

export const metadata = {
  title: 'Προφίλ - NextService',
  description: 'Δείτε και επεξεργαστείτε τα στοιχεία του προφίλ σας',
}






