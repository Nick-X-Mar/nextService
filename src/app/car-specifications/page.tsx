import CarSpecificationsPage from './components/CarSpecificationsPage'

export default function Page() {
  return <CarSpecificationsPage />
}

export const metadata = {
  title: 'Στοιχεία Αυτοκινήτου',
  description: 'Παρακαλώ συμπληρώστε τα τεχνικά στοιχεία του αυτοκινήτου σας',
  robots: { index: false, follow: false },
}
