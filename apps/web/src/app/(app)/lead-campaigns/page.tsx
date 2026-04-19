import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Megaphone } from 'lucide-react'

export const metadata = { title: 'Lead Campaigns' }

export default async function LeadCampaignsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Lead Campaigns</h1>
      <p className="text-sm text-gray-500 mb-6">
        Manage marketing campaigns that bring in leads — each with an assigned lead source and phone number.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Lead Campaigns module coming soon</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto">
          This module will let you create and manage lead campaigns with dedicated
          lead sources and phone numbers. Specs to be discussed.
        </p>
      </div>
    </div>
  )
}
