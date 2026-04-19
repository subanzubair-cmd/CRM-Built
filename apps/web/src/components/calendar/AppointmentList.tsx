'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { MapPin, Clock, Trash2 } from 'lucide-react'

interface AppointmentRow {
  id: string
  title: string
  description: string | null
  startAt: Date
  endAt: Date
  location: string | null
  attendees: string[]
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    leadType: string
  } | null
}

interface Props {
  rows: AppointmentRow[]
  total: number
}

export function AppointmentList({ rows, total }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function deleteAppointment(apptId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this appointment?')) return
    await fetch(`/api/appointments/${apptId}`, { method: 'DELETE' })
    startTransition(() => router.refresh())
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No upcoming appointments</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map((appt) => {
        const pipeline = appt.property?.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
        const isUpcoming = !isPast(new Date(appt.startAt))
        return (
          <div
            key={appt.id}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUpcoming ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{appt.title}</h3>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(appt.startAt), 'MMM d, h:mm a')} – {format(new Date(appt.endAt), 'h:mm a')}
                    <span className="text-gray-400 ml-1">({formatDistanceToNow(new Date(appt.startAt), { addSuffix: true })})</span>
                  </span>
                  {appt.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {appt.location}
                    </span>
                  )}
                </div>
                {appt.property && (
                  <button
                    onClick={() => router.push(`/leads/${pipeline}/${appt.property!.id}`)}
                    className="mt-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {appt.property.streetAddress ?? 'Unknown property'}, {appt.property.city}
                  </button>
                )}
                {appt.description && (
                  <p className="mt-1 text-[11px] text-gray-500 line-clamp-2">{appt.description}</p>
                )}
              </div>
              <button
                onClick={(e) => deleteAppointment(appt.id, e)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                title="Delete appointment"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
