import GarageChatsPage from './components/GarageChatsPage'

interface PageProps {
  params: Promise<{
    garageId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { garageId } = await params
  return <GarageChatsPage garageId={garageId} />
}

