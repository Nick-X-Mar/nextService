import { redirect } from 'next/navigation'

export default function RequestsPage() {
  // Server-side redirect to landing page if no clientId is provided
  redirect('/')
}

export const metadata = {
  title: 'Αιτήματα Υπηρεσιών',
  description: 'Δείτε όλα τα αιτήματα υπηρεσιών που έχετε κάνει',
}