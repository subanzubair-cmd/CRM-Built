'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddLeadModal } from './AddLeadModal'

export function AddLeadButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add
      </button>
      <AddLeadModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
