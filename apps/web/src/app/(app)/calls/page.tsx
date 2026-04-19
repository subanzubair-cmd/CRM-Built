import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ActiveCallsPanel } from '@/components/calls/ActiveCallsPanel'

export const metadata = { title: 'Active Calls' }

export default async function CallsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Live Calls</h1>
      <p className="text-sm text-gray-500 mb-5">
        Monitor active calls and join as coach (whisper) or full participant (barge).
      </p>
      <ActiveCallsPanel />
    </div>
  )
}
