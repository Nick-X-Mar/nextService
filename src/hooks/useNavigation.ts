'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'

/**
 * `router.push` on its own gives no feedback — App Router navigations can wait
 * on a server component before anything visibly changes, which is why tapping
 * "Δες προσφορές" used to feel like nothing happened. Wrapping the push in a
 * transition keeps `isNavigating` true until the destination is actually ready,
 * so the button can spin for exactly as long as the wait lasts.
 *
 *   const { navigate, isNavigating } = useNavigation()
 *   <button onClick={() => navigate(href)} disabled={isNavigating(href)}>
 *     {isNavigating(href) ? <Spinner /> : <Icon name="arrow_forward" size="sm" />}
 *   </button>
 *
 * Pass the href to `isNavigating` in lists so only the tapped row spins; call it
 * with no argument when the component has a single navigating button.
 */
export function useNavigation() {
  const router = useRouter()
  const [isTransitioning, startTransition] = useTransition()
  const [target, setTarget] = useState<string | null>(null)

  const navigate = useCallback(
    (href: string) => {
      setTarget(href)
      startTransition(() => {
        router.push(href)
      })
    },
    [router]
  )

  const back = useCallback(() => {
    setTarget('__back__')
    startTransition(() => {
      router.back()
    })
  }, [router])

  const isNavigating = useCallback(
    (href?: string) => isTransitioning && (href === undefined || target === href),
    [isTransitioning, target]
  )

  return { navigate, back, isNavigating }
}
