'use client'

import dynamic from 'next/dynamic'

/**
 * ClientCallShell — wraps the inbound-call popup + persistent on-call
 * bar with `ssr: false` so they never render in the server-side HTML.
 *
 * Why this exists: the (app) layout is a server component, so any
 * 'use client' component placed inside it (InboundCallNotification,
 * ActiveCallBar) STILL gets server-rendered with its initial state —
 * even if that initial render is null. The ensuing hydration step
 * compares server tree to client tree.
 *
 * Browser extensions (1Password, Grammarly, dark-mode injectors,
 * Honey, etc.) routinely inject or wrap DOM nodes around the layout
 * before React hydrates. That causes a structural mismatch at the
 * AppLayout div level — server has `<div>...children...</div>`, but
 * client has `<header>` (or whatever the extension reordered to)
 * directly under TimezoneProvider. suppressHydrationWarning only
 * suppresses one level deep — the structural shift can't be silenced.
 *
 * Loading these via `dynamic({ ssr: false })` means they don't appear
 * in the server HTML at all. The hydration tree and the server tree
 * agree (both empty here), so any extension shenanigans happen AFTER
 * React has finished hydrating — they can no longer cause a mismatch.
 */
const InboundCallNotification = dynamic(
  () =>
    import('@/components/calls/InboundCallNotification').then(
      (m) => m.InboundCallNotification,
    ),
  { ssr: false },
)

const ActiveCallBar = dynamic(
  () => import('@/components/calls/ActiveCallBar').then((m) => m.ActiveCallBar),
  { ssr: false },
)

export function ActiveCallBarClient() {
  return <ActiveCallBar />
}

export function InboundCallNotificationClient() {
  return <InboundCallNotification />
}
