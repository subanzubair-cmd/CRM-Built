'use client'

import { useEffect, useState } from 'react'
import { InboundCallNotification } from '@/components/calls/InboundCallNotification'
import { ActiveCallBar } from '@/components/calls/ActiveCallBar'

/**
 * ClientCallShell — defers the inbound-call popup + persistent on-call
 * bar until AFTER hydration so they never appear in the server-side
 * HTML.
 *
 * Why we don't render them on the server:
 *   - The (app) layout is a server component. Any 'use client'
 *     component placed inside it still gets server-rendered with its
 *     initial state, and the ensuing hydration step compares server
 *     tree to client tree.
 *   - Browser extensions (1Password, Grammarly, dark-mode injectors,
 *     etc.) routinely inject or wrap DOM nodes around the layout
 *     before React hydrates, causing structural mismatches that
 *     `suppressHydrationWarning` can't silence.
 *
 * Originally this used `dynamic({ ssr: false })`, but Next.js wraps
 * dynamic-imported components in a React.lazy + Suspense boundary,
 * and HMR sometimes serves stale Suspense markers in the SSR HTML
 * after the layout structure changes — producing the exact hydration
 * error we were trying to avoid (`<Suspense>` server vs `<div>`
 * client at the layout root). A simple mount-on-effect pattern
 * achieves the same "client-only" outcome with zero Suspense
 * boundaries, so both server and client trees see plain `null` at
 * this slot until effects run after hydration.
 */

export function ActiveCallBarClient() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <ActiveCallBar />
}

export function InboundCallNotificationClient() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <InboundCallNotification />
}
