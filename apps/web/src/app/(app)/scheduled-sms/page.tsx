import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ScheduledSmsClient } from '@/components/campaigns/ScheduledSmsClient'

export const metadata = { title: 'Scheduled SMS' }

export default async function ScheduledSmsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Scheduled SMS</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          All active drip campaign enrollments and their next scheduled sends
        </p>
      </div>
      <ScheduledSmsClient />
    </div>
  )
}
