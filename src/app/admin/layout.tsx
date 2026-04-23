import AdminShell from './components/AdminShell'

export const metadata = {
  title: 'NextService Admin',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
