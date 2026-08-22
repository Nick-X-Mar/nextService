import Link from 'next/link'

/** The uppercase micro-label breadcrumb used across the marketing pages. */
export default function Breadcrumb({ label }: { label: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
        <li>
          <Link href="/" className="hover:text-primary transition-colors">
            Αρχική
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li className="text-primary">{label}</li>
      </ol>
    </nav>
  )
}
