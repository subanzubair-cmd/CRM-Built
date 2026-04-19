'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AppointmentModal } from './AppointmentModal'

export function CalendarHeader() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upcoming appointments</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </div>
      <AppointmentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
