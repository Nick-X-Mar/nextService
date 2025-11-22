import GarageAppointmentsChatsPage from './components/GarageAppointmentsChatsPage'

interface PageProps {
  params: Promise<{
    garageId: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { garageId } = await params
  return <GarageAppointmentsChatsPage garageId={garageId} />
}

