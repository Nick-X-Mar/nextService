import GarageDashboardPage from './components/GarageDashboardPage'

interface PageProps {
  params: Promise<{
    garageId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { garageId } = await params
  return <GarageDashboardPage garageId={garageId} />
}
