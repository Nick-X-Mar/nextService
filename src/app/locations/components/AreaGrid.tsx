import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import type { AreaContent } from '@/types/siteContent'

/**
 * The area cards on /locations/.
 *
 * Slugs are inherited from the WordPress site and still carry its search
 * authority, so these hrefs must keep matching the legacy redirect map in
 * next.config.ts. The area editor cannot change a slug for that reason.
 */
export default function AreaGrid({ areas }: { areas: AreaContent[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {areas.map((a) => (
        <li key={a.slug}>
          <Link
            href={`/location/${a.slug}/`}
            className="block h-full bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10 hover:shadow-2xl hover:shadow-on-surface/5 transition-all duration-300"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Icon name="location_on" size="sm" className="text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                  {a.region}
                </span>
              </div>
              <span
                className={
                  a.coverage === 'active'
                    ? 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-green-700 bg-green-100 px-2 py-1 rounded-sm'
                    : 'text-[0.65rem] font-black uppercase tracking-[0.1em] text-amber-800 bg-amber-100 px-2 py-1 rounded-sm'
                }
              >
                {a.coverage === 'active' ? 'Ενεργό' : 'Σύντομα'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-on-surface mb-2">{a.name}</h2>
            <p className="text-sm text-secondary leading-relaxed">{a.description}</p>
            <p className="mt-3 text-xs text-on-surface-variant">
              {a.neighbourhoods.slice(0, 4).join(' · ')}
              {a.neighbourhoods.length > 4 && ` + ${a.neighbourhoods.length - 4} ακόμη`}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
