'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { NewLeadModal } from './NewLeadModal'

interface Props {
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
}

export function NewLeadButton({ leadType }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Lead
      </button>
      {open && (
        <NewLeadModal
          leadType={leadType}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
