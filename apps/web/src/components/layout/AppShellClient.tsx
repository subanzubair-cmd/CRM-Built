'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  InboundCallNotificationClient,
  ActiveCallBarClient,
} from '@/components/calls/ClientCallShell'

/**
 * AppShellClient — wraps the (app) layout body and delays its chrome
 * until AFTER hydration. Server-rendered chrome (`header`, `sidebar`)
 * is passed in AS PROPS by the server-component parent — never
 * imported here — so that this client component never transitively
 * pulls Sequelize / pg / Node-only modules into the client bundle.
 *
 * Why we gate chrome behind a useEffect mount:
 *
 * Browser extensions (1Password, Grammarly, dark-mode injectors,
 * etc.) routinely inject wrapper nodes around elements in the body
 * before React hydrates. When that happens inside the layout's
 * chrome, React detects a structural mismatch between server HTML
 * and the client tree (e.g. it expects the wrapper `<div>` but
 * finds a `<header>` directly under the provider) and the dev
 * overlay throws a hydration error. `suppressHydrationWarning` only
 * suppresses ATTRIBUTE mismatches on a single element — structural
 * mismatches still error.
 *
 * By rendering the chrome only after hydration, the server-rendered
 * shell is just a plain wrapper div + page main. There's nothing
 * for an extension to mangle structurally. After hydration, the
 * chrome mounts. The flicker is sub-frame on a fresh load and zero
 * on client-side navigation.
 */

interface Props {
  /** GlobalHeader rendered by the server-component parent. */
  header: ReactNode
  /** Sidebar rendered by the server-component parent. */
  sidebar: ReactNode
  /** Page content. Rendered server-side and passed straight through. */
  children: ReactNode
}

export function AppShellClient({ header, sidebar, children }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="flex flex-col h-screen bg-slate-50" suppressHydrationWarning>
      {/* Persistent on-call bar — pure client component, already
          mount-on-effect, so it cannot trip hydration. */}
      {mounted && <ActiveCallBarClient />}

      {/* Server-rendered chrome — pre-rendered into RSC payload by
          the parent server component; we just decide WHEN to insert
          it into the live tree. */}
      {mounted && header}

      <div className="flex flex-1 overflow-hidden">
        {mounted && sidebar}
        <main className="flex-1 overflow-auto p-5">{children}</main>
      </div>

      {mounted && <InboundCallNotificationClient />}
    </div>
  )
}
