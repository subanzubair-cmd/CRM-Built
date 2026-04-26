import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { GlobalHeader } from '@/components/layout/GlobalHeader'
import { InboundCallNotification } from '@/components/calls/InboundCallNotification'
import { ActiveCallBar } from '@/components/calls/ActiveCallBar'
import { TimezoneProvider } from '@/components/providers/TimezoneProvider'
import { getCompanySettings } from '@/lib/company-settings'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  // Read CRM-wide settings once per request and pipe them down via
  // context. Every date-display component (MessageThread, ActivityCard,
  // /activity, lead detail timestamps, etc.) renders through this zone
  // regardless of the user's machine locale.
  const { timezone } = await getCompanySettings()

  return (
    // InboundCallNotification is moved to the end of the tree (it uses
    // fixed positioning so visual order is irrelevant) so it can never
    // be the first child a browser extension wraps — that's the
    // commonest cause of the React hydration warning we were seeing.
    // suppressHydrationWarning is still set on the wrapper as a belt
    // for any other extension-driven attribute mismatches.
    <TimezoneProvider timezone={timezone}>
      <div className="flex flex-col h-screen bg-slate-50" suppressHydrationWarning>
        {/* Persistent on-call header — only renders for the tab that
            claimed the active call. Survives all client-side nav. */}
        <ActiveCallBar />
        <GlobalHeader />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto p-5">
            {children}
          </main>
        </div>
        <InboundCallNotification />
      </div>
    </TimezoneProvider>
  )
}
