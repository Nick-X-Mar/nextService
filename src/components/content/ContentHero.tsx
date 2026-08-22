import { RichLine } from '@/components/content/RichText'
import type { ContentHero as Hero } from '@/types/siteContent'

/**
 * The page heading shared by every CMS-backed marketing page.
 *
 * `titleAccent` is rendered in the brand colour, which is how these headings
 * were written by hand ("Σχετικά με το **NextService**"). Keeping it a
 * separate field means an editor can move the emphasis without being able to
 * inject markup into an <h1>.
 */
export default function ContentHero({
  hero,
  size = 'display',
}: {
  hero: Hero
  size?: 'display' | 'compact'
}) {
  const headingClass =
    size === 'display'
      ? 'text-4xl font-black tracking-tight text-on-surface sm:text-5xl'
      : 'text-3xl font-black tracking-tight text-on-surface'

  return (
    <header className="mb-10">
      <h1 className={headingClass}>
        {hero.title}
        {hero.title && hero.titleAccent ? ' ' : ''}
        {hero.titleAccent && <span className="text-primary">{hero.titleAccent}</span>}
      </h1>
      {hero.lead && (
        <p className="mt-4 text-base text-secondary leading-relaxed">
          <RichLine text={hero.lead} />
        </p>
      )}
    </header>
  )
}
