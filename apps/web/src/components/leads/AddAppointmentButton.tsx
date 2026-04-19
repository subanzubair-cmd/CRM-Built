'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AppointmentModal } from '@/components/calendar/AppointmentModal'

interface Props {
  propertyId: string
}

export function AddAppointmentButton({ propertyId }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add
      </button>
      <AppointmentModal
        open={open}
        onClose={() => setOpen(false)}
        defaultPropertyId={propertyId}
      />
    </>
  )
}
