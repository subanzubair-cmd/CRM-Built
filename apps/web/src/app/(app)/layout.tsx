import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { GlobalHeader } from '@/components/layout/GlobalHeader'
import { InboundCallNotification } from '@/components/calls/InboundCallNotification'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    // suppressHydrationWarning: InboundCallNotification is a 'use client'
    // component that returns null on first mount; combined with browser
    // extensions that wrap top-level elements, this can produce a benign
    // mismatch React surfaces as a recoverable hydration error. The render
    // tree is identical post-hydration, so silencing the warning here is
    // the React-recommended escape hatch.
    <div className="flex flex-col h-screen bg-slate-50" suppressHydrationWarning>
      <InboundCallNotification />
      <GlobalHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-5">
          {children}
        </main>
      </div>
    </div>
  )
}
