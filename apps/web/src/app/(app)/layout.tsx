import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { GlobalHeader } from '@/components/layout/GlobalHeader'
import { PageLoadingBar } from '@/components/ui/PageLoadingBar'
import { InboundCallNotification } from '@/components/calls/InboundCallNotification'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <PageLoadingBar />
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
