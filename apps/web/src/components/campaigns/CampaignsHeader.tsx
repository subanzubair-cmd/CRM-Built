'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddCampaignModal } from './AddCampaignModal'

export function CampaignsHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Drip Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Add / manage automated drip sequences across modules.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          New Drip Campaign
        </button>
      </div>
      <AddCampaignModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
