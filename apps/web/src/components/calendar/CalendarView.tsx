'use client'
import { useState, useCallback } from 'react'
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
})

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource?: {
    propertyId: string
    propertyAddress?: string
    propertyPipelineStatus?: string
    location?: string | null
  }
}

interface AppointmentData {
  id: string
  title: string
  startAt: string | Date
  endAt: string | Date
  location?: string | null
  propertyId: string
  property?: {
    streetAddress?: string | null
    city?: string | null
    propertyStatus?: string
  }
}

interface CalendarViewProps {
  appointments: AppointmentData[]
}

// Color appointments by pipeline status
function getEventColor(status?: string): string {
  switch (status) {
    case 'IN_TM': return '#f97316'        // orange
    case 'IN_INVENTORY': return '#3b82f6' // blue
    case 'IN_DISPO': return '#a855f7'     // purple
    case 'SOLD': return '#22c55e'         // green
    default: return '#3b82f6'             // blue (lead)
  }
}

export function CalendarView({ appointments }: CalendarViewProps) {
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState(new Date())
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')

  const events: CalendarEvent[] = appointments.map(a => ({
    id: a.id,
    title: a.title,
    start: new Date(a.startAt),
    end: new Date(a.endAt),
    resource: {
      propertyId: a.propertyId,
      propertyAddress: a.property
        ? [a.property.streetAddress, a.property.city].filter(Boolean).join(', ')
        : undefined,
      propertyPipelineStatus: a.property?.propertyStatus,
      location: a.location,
    },
  }))

  const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }) => {
    setSelectedSlot({ start, end })
    setSelectedEvent(null)
    setModalMode('create')
    setShowModal(true)
  }, [])

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event)
    setSelectedSlot(null)
    setModalMode('edit')
    setShowModal(true)
  }, [])

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const color = getEventColor(event.resource?.propertyPipelineStatus)
    return {
      style: {
        backgroundColor: color,
        borderColor: color,
        color: 'white',
        borderRadius: '4px',
        fontSize: '12px',
      },
    }
  }, [])

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div style={{ height: 680 }}>
        <Calendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          selectable
          popup
          views={['month', 'week', 'day', 'agenda']}
          style={{ height: '100%', padding: '12px' }}
        />
      </div>

      {/* Create modal */}
      {showModal && modalMode === 'create' && selectedSlot && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg"
            >
              ✕
            </button>
            <CreateAppointmentForm
              defaultStart={selectedSlot.start}
              defaultEnd={selectedSlot.end}
              onClose={() => setShowModal(false)}
              onCreated={() => {
                setShowModal(false)
                ;(window as any).showPageLoading?.()
                window.location.reload()
              }}
            />
          </div>
        </div>
      )}

      {/* Edit/view modal */}
      {showModal && modalMode === 'edit' && selectedEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg"
            >
              ✕
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-1">{selectedEvent.title}</h2>
            <p className="text-sm text-gray-500 mb-1">
              {format(selectedEvent.start, 'PPP p')} – {format(selectedEvent.end, 'p')}
            </p>
            {selectedEvent.resource?.propertyAddress && (
              <p className="text-sm text-gray-600 mb-1">
                📍 {selectedEvent.resource.propertyAddress}
              </p>
            )}
            {selectedEvent.resource?.location && (
              <p className="text-sm text-gray-600">🏠 {selectedEvent.resource.location}</p>
            )}
            <div className="mt-4 flex gap-2">
              <a
                href={`/leads/dts/${selectedEvent.resource?.propertyId}?tab=appointments`}
                className="text-sm text-blue-600 hover:underline"
              >
                View property →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Inline create form — directs user to property detail page since appointments require a propertyId
function CreateAppointmentForm({
  defaultStart,
  onClose,
}: {
  defaultStart: Date
  defaultEnd: Date
  onClose: () => void
  onCreated: () => void
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">New Appointment</h2>
      <p className="text-sm text-gray-500 mb-2">
        Scheduled for: <strong>{format(defaultStart, 'PPP p')}</strong>
      </p>
      <p className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
        To create appointments, open any property and go to the{' '}
        <strong>Appointments</strong> tab. From there you can link an appointment directly
        to the property.
      </p>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Close
        </button>
      </div>
    </div>
  )
}
