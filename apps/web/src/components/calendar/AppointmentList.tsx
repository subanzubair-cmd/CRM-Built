'use client'

import { useRouter } from 'next/navigation'
import { useTransition, useState } from 'react'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { MapPin, Clock, Trash2, CheckCircle, XCircle } from 'lucide-react'

interface AppointmentRow {
  id: string
  title: string
  description: string | null
  startAt: Date
  endAt: Date
  location: string | null
  attendees: string[]
  outcome: 'KEPT' | 'NOT_KEPT' | null
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
  const [savingId, setSavingId] = useState<string | null>(null)

  async function deleteAppointment(apptId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this appointment?')) return
    await fetch(`/api/appointments/${apptId}`, { method: 'DELETE' })
    startTransition(() => router.refresh())
  }

  async function recordOutcome(apptId: string, outcome: 'KEPT' | 'NOT_KEPT') {
    setSavingId(apptId)
    try {
      await fetch(`/api/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      startTransition(() => router.refresh())
    } finally {
      setSavingId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No appointments</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map((appt) => {
        const pipeline = appt.property?.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
        const isUpcoming = !isPast(new Date(appt.startAt))
        const isPastAppt = isPast(new Date(appt.startAt))
        const needsOutcome = isPastAppt && appt.outcome === null

        return (
          <div
            key={appt.id}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    appt.outcome === 'KEPT' ? 'bg-emerald-500' :
                    appt.outcome === 'NOT_KEPT' ? 'bg-red-400' :
                    isUpcoming ? 'bg-blue-500' : 'bg-gray-300'
                  }`} />
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{appt.title}</h3>

                  {/* Outcome badge */}
                  {appt.outcome === 'KEPT' && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex-shrink-0">
                      <CheckCircle className="w-3 h-3" /> Kept
                    </span>
                  )}
                  {appt.outcome === 'NOT_KEPT' && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 flex-shrink-0">
                      <XCircle className="w-3 h-3" /> Not Kept
                    </span>
                  )}
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

                {/* Outcome buttons — shown after appointment time has passed and no outcome set */}
                {needsOutcome && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 font-medium">Appointment outcome:</span>
                    <button
                      onClick={() => recordOutcome(appt.id, 'KEPT')}
                      disabled={savingId === appt.id}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3 h-3" /> Kept
                    </button>
                    <button
                      onClick={() => recordOutcome(appt.id, 'NOT_KEPT')}
                      disabled={savingId === appt.id}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3 h-3" /> Not Kept
                    </button>
                  </div>
                )}

                {/* Allow re-recording if outcome already set */}
                {isPastAppt && appt.outcome !== null && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      onClick={() => recordOutcome(appt.id, appt.outcome === 'KEPT' ? 'NOT_KEPT' : 'KEPT')}
                      disabled={savingId === appt.id}
                      className="text-[10px] text-gray-400 hover:text-gray-600 underline transition-colors disabled:opacity-50"
                    >
                      Change to {appt.outcome === 'KEPT' ? 'Not Kept' : 'Kept'}
                    </button>
                  </div>
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
