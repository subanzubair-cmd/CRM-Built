'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { ImportListModal } from './ImportListModal'

export function ListStackingHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">List Stacking</h1>
          <p className="text-sm text-gray-500 mt-0.5">Import lead lists and find overlapping addresses</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700"
        >
          <Upload className="w-4 h-4" />
          Import List
        </button>
      </div>
      <ImportListModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
