'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, PhoneOff, X, Calendar, FileText, Clock, MapPin, Video, CheckSquare } from 'lucide-react'

/* ── REsimpli-style two-branch call outcome flow ── */

const CONNECTED_OUTCOMES = [
  { value: 'appointment_set', label: 'Appointment Set', color: 'bg-green-50 border-green-200 text-green-700' },
  { value: 'offer_made', label: 'Offer Made', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { value: 'moved_to_dead', label: 'Moved to Dead Lead', color: 'bg-red-50 border-red-200 text-red-700' },
  { value: 'moved_to_warm', label: 'Moved to Warm Lead', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { value: 'moved_to_referred', label: 'Moved to Referred To Agent', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { value: 'other_connected', label: 'Other', color: 'bg-gray-50 border-gray-200 text-gray-700' },
]

const NOT_CONNECTED_OUTCOMES = [
  { value: 'left_voicemail', label: 'Left Voicemail and/or SMS', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { value: 'no_answer', label: 'Not Answered', color: 'bg-gray-50 border-gray-200 text-gray-700' },
  { value: 'moved_to_dead_nc', label: 'Moved to Dead Lead', color: 'bg-red-50 border-red-200 text-red-700' },
  { value: 'moved_to_warm_nc', label: 'Moved to Warm Lead', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { value: 'moved_to_referred_nc', label: 'Moved to Referred To Agent', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { value: 'other_not_connected', label: 'Other', color: 'bg-gray-50 border-gray-200 text-gray-700' },
]

// Status changes triggered by certain outcomes
const STATUS_CHANGES: Record<string, string> = {
  moved_to_dead: 'DEAD',
  moved_to_warm: 'WARM',
  moved_to_referred: 'REFERRED_TO_AGENT',
  moved_to_dead_nc: 'DEAD',
  moved_to_warm_nc: 'WARM',
  moved_to_referred_nc: 'REFERRED_TO_AGENT',
}

// Stage changes triggered by certain outcomes
const STAGE_CHANGES: Record<string, string> = {
  appointment_set: 'APPOINTMENT_MADE',
  offer_made: 'OFFER_MADE',
}

const APPOINTMENT_TYPES = [
  { value: 'PHONE_CALL', label: 'Phone Call', icon: Phone },
  { value: 'IN_PERSON', label: 'In-Person', icon: MapPin },
  { value: 'VIRTUAL', label: 'Virtual', icon: Video },
]

function getTomorrowDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

interface Props {
  propertyId: string
  callId: string | null
  callStartedAt: Date
  contactName?: string
  contactPhone?: string
  propertyAddress?: string
  onClose: () => void
}

export function CallOutcomeModal({
  propertyId,
  callId,
  callStartedAt,
  contactName,
  contactPhone,
  propertyAddress,
  onClose,
}: Props) {
  const router = useRouter()
  const [connectionType, setConnectionType] = useState<'connected' | 'not_connected' | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Task creation state
  const [createTask, setCreateTask] = useState(false)
  const [taskTitle, setTaskTitle] = useState(
    contactName ? `Follow up on call with ${contactName}` : 'Follow up on call'
  )
  const [taskDueDate, setTaskDueDate] = useState(getTomorrowDate())

  // Appointment scheduling state
  const [setAppointment, setSetAppointment] = useState(false)
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('')
  const [appointmentType, setAppointmentType] = useState('PHONE_CALL')

  const durationSecs = Math.floor((Date.now() - callStartedAt.getTime()) / 1000)
  const durationLabel = durationSecs < 60
    ? `${durationSecs}s`
    : `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s`

  const outcomes = connectionType === 'connected' ? CONNECTED_OUTCOMES
    : connectionType === 'not_connected' ? NOT_CONNECTED_OUTCOMES
    : []

  const hasContextInfo = contactName || contactPhone || propertyAddress

  async function logOutcome() {
    if (!outcome || !connectionType) return
    setSaving(true)
    setError(null)

    const outcomeLabel = outcomes.find((o) => o.value === outcome)?.label ?? outcome
    const connLabel = connectionType === 'connected' ? 'LEAD CONNECTED' : 'LEAD NOT-CONNECTED'
    const body = [`${connLabel} (${outcomeLabel})`, notes.trim()].filter(Boolean).join(' — ')

    try {
      // 1. Log the call outcome as a message
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          channel: 'CALL',
          direction: 'OUTBOUND',
          body: `${body} (${durationLabel})`,
        }),
      })
      if (!res.ok) throw new Error('Failed to log outcome')

      // 2. Apply status change if outcome triggers one
      const newStatus = STATUS_CHANGES[outcome]
      if (newStatus) {
        await fetch(`/api/leads/${propertyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadStatus: newStatus }),
        })
      }

      // 3. Apply stage change if outcome triggers one
      const newStage = STAGE_CHANGES[outcome]
      if (newStage) {
        await fetch(`/api/leads/${propertyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeLeadStage: newStage }),
        })
      }

      // 4. Fire-and-forget: create task and/or appointment in parallel
      const sideEffects: Promise<Response>[] = []

      if (createTask && taskTitle.trim() && taskDueDate) {
        sideEffects.push(
          fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              propertyId,
              title: taskTitle.trim(),
              dueDate: taskDueDate,
              status: 'PENDING',
            }),
          })
        )
      }

      if (setAppointment && appointmentDate && appointmentTime) {
        sideEffects.push(
          fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              propertyId,
              date: appointmentDate,
              time: appointmentTime,
              type: appointmentType,
            }),
          })
        )
      }

      // Fire and forget — don't block close on these
      if (sideEffects.length > 0) {
        Promise.all(sideEffects).catch(() => {
          // Silently fail — side effects are best-effort
        })
      }

      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error logging outcome')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm text-gray-900">Log Call Outcome</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Duration: {durationLabel}</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Context display — contact + property info */}
          {hasContextInfo && (
            <div className="space-y-0.5">
              {(contactName || contactPhone) && (
                <p className="text-xs text-gray-500">
                  {contactName && <span className="font-medium text-gray-600">{contactName}</span>}
                  {contactName && contactPhone && <span> &middot; </span>}
                  {contactPhone && <span>{contactPhone}</span>}
                </p>
              )}
              {propertyAddress && (
                <p className="text-xs text-gray-500">{propertyAddress}</p>
              )}
            </div>
          )}

          {/* Step 1: Connection type */}
          {!connectionType ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Did you connect with the lead?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConnectionType('connected')}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors"
                >
                  <Phone className="w-6 h-6 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">Lead Connected</span>
                </button>
                <button
                  onClick={() => setConnectionType('not_connected')}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-colors"
                >
                  <PhoneOff className="w-6 h-6 text-red-500" />
                  <span className="text-sm font-semibold text-red-600">Lead Not Connected</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Connection type badge */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${
                  connectionType === 'connected'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {connectionType === 'connected' ? <Phone className="w-3 h-3" /> : <PhoneOff className="w-3 h-3" />}
                  {connectionType === 'connected' ? 'Lead Connected' : 'Lead Not Connected'}
                </span>
                <button
                  onClick={() => { setConnectionType(null); setOutcome(null) }}
                  className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Step 2: Call result */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Call Result</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {outcomes.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setOutcome(o.value)}
                      className={`text-xs font-medium px-3 py-2.5 rounded-lg border text-left transition-colors ${
                        outcome === o.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : `${o.color} hover:opacity-80`
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter reason or additional details..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                />
              </div>

              {/* ── Create Follow-up Task ── */}
              <div className="border border-gray-100 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <CheckSquare className="w-3.5 h-3.5 text-gray-400" />
                    Create a follow-up task?
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createTask}
                    onClick={() => setCreateTask(!createTask)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                      createTask ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                        createTask ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {createTask && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder={`Follow up on call with ${contactName || 'lead'}`}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Due date</label>
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Set Appointment ── */}
              <div className="border border-gray-100 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    Set an appointment?
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={setAppointment}
                    onClick={() => setSetAppointment(!setAppointment)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                      setAppointment ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                        setAppointment ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {setAppointment && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-0.5 block">Date</label>
                        <input
                          type="date"
                          value={appointmentDate}
                          onChange={(e) => setAppointmentDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-0.5 block">Time</label>
                        <input
                          type="time"
                          value={appointmentTime}
                          onChange={(e) => setAppointmentTime(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Type</label>
                      <select
                        value={appointmentType}
                        onChange={(e) => setAppointmentType(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors bg-white"
                      >
                        {APPOINTMENT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        {connectionType && (
          <div className="px-5 pb-5 pt-1 flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={logOutcome}
              disabled={!outcome || saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50 transition-colors active:scale-95"
            >
              {saving ? 'Saving\u2026' : 'Log Outcome'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
