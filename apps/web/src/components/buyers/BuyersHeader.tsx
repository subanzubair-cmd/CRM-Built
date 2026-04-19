'use client'

import { useState } from 'react'
import { Plus, Send } from 'lucide-react'
import { AddBuyerModal } from './AddBuyerModal'
import { BuyerBlastModal } from './BuyerBlastModal'

export function BuyersHeader() {
  const [modalOpen, setModalOpen] = useState(false)
  const [blastOpen, setBlastOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Buyers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cash buyers and active purchasers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBlastOpen(true)}
            className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Send Blast
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Buyer
          </button>
        </div>
      </div>
      <AddBuyerModal open={modalOpen} onClose={() => setModalOpen(false)} />
      {blastOpen && <BuyerBlastModal onClose={() => setBlastOpen(false)} />}
    </>
  )
}
