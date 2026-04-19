'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { ComposeEmailModal } from './ComposeEmailModal'

export function EmailHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Email</h1>
          <p className="text-sm text-gray-500 mt-0.5">Email conversations across all leads</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700"
        >
          <Pencil className="w-4 h-4" />
          Compose
        </button>
      </div>
      <ComposeEmailModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
