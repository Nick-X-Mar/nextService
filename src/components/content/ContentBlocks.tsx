import type { ReactNode } from 'react'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import FaqAccordion from '@/components/FaqAccordion'
import RichText, { RichLine } from '@/components/content/RichText'
import type { ContentBlock } from '@/types/siteContent'

/**
 * Renders an admin-authored block list using the same markup the pages used
 * when this copy was hardcoded, so moving a page onto the CMS is invisible in
 * the output. Each block type maps to a shape that already existed somewhere
 * in the marketing pages — there are no new visual primitives here.
 */

function Cards({ items }: { items: Extract<ContentBlock, { type: 'cards' }>['items'] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => {
        const inner = (
          <>
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-surface-container text-primary shrink-0">
              <Icon name={item.icon || 'check_circle'} size="md" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-on-surface mb-1">
                <span className="text-primary">{i + 1}.</span> {item.title}
              </h3>
              <p className="text-sm text-secondary leading-relaxed">
                <RichLine text={item.body} />
              </p>
            </div>
          </>
        )
        const shell =
          'flex gap-4 bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_24px_rgba(27,28,28,0.04)] border border-outline-variant/10'
        return (
          <li key={`${i}-${item.title}`}>
            {item.href ? (
              <Link href={item.href} className={`${shell} transition-all duration-300 hover:shadow-2xl hover:shadow-on-surface/5`}>
                {inner}
              </Link>
            ) : (
              <div className={shell}>{inner}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Callout({ tone, text }: { tone: 'info' | 'warning'; text: string }) {
  const palette =
    tone === 'warning'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-blue-50 border-blue-200 text-blue-900'
  return (
    <div className={`rounded-xl border p-4 text-sm leading-relaxed ${palette}`}>
      <RichLine text={text} />
    </div>
  )
}

function Cta({ label, href, variant }: { label: string; href: string; variant: 'primary' | 'secondary' }) {
  const className =
    variant === 'primary'
      ? 'inline-flex bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 items-center gap-2'
      : 'inline-flex border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 items-center gap-2'
  return (
    <Link href={href} className={className}>
      <Icon name={variant === 'primary' ? 'send' : 'arrow_forward'} size="sm" />
      {label}
    </Link>
  )
}

export default function ContentBlocks({
  blocks,
  renderAreas,
}: {
  blocks: ContentBlock[]
  /**
   * Fills an `areas` placeholder block. Only /locations/ passes one; anywhere
   * else the placeholder renders as nothing rather than as an error.
   */
  renderAreas?: () => ReactNode
}) {
  // Consecutive CTAs share one flex row, the way the hand-written pages laid
  // out their button pairs.
  const groups: ContentBlock[][] = []
  for (const block of blocks) {
    const previous = groups[groups.length - 1]
    if (block.type === 'cta' && previous?.[0]?.type === 'cta') previous.push(block)
    else groups.push([block])
  }

  return (
    <>
      {groups.map((group, gi) => {
        if (group[0].type === 'cta') {
          return (
            <div key={`cta-${gi}`} className="flex flex-wrap gap-3 mb-10">
              {group.map((b) => {
                const cta = b as Extract<ContentBlock, { type: 'cta' }>
                return <Cta key={cta.id} label={cta.label} href={cta.href} variant={cta.variant} />
              })}
            </div>
          )
        }

        const block = group[0]
        switch (block.type) {
          case 'heading':
            return (
              <h2 key={block.id} className="text-2xl font-bold tracking-tight text-on-surface mb-4 mt-10 first:mt-0">
                <RichLine text={block.text} />
              </h2>
            )
          case 'paragraph':
            return (
              <div key={block.id} className="mb-6">
                <RichText text={block.text} />
              </div>
            )
          case 'list':
            return (
              <ul key={block.id} className="list-disc pl-5 space-y-2 mb-6 text-base text-secondary leading-relaxed">
                {block.items.map((item, i) => (
                  <li key={i}>
                    <RichLine text={item} />
                  </li>
                ))}
              </ul>
            )
          case 'faq':
            return (
              <section key={block.id} className="mb-10">
                {block.title && (
                  <div className="flex items-center gap-2 mb-4">
                    {block.icon && <Icon name={block.icon} size="md" className="text-primary" />}
                    <h2 className="text-2xl font-bold tracking-tight text-on-surface">{block.title}</h2>
                  </div>
                )}
                <FaqAccordion items={block.items} />
              </section>
            )
          case 'cards':
            return (
              <div key={block.id} className="mb-10">
                <Cards items={block.items} />
              </div>
            )
          case 'areas':
            return renderAreas ? <div key={block.id} className="mb-10">{renderAreas()}</div> : null
          case 'callout':
            return (
              <div key={block.id} className="mb-8">
                <Callout tone={block.tone} text={block.text} />
              </div>
            )
          default:
            return null
        }
      })}
    </>
  )
}
