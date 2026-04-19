'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Phone,
  X,
  Minimize2,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Zap,
  Calendar,
  ListTodo,
  FileText,
  Pencil,
  CheckCircle2,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────────────── */

interface ContactOption {
  id: string
  name: string
  phone: string
  type?: string
}

interface TwilioNumber {
  id: string
  number: string
  friendlyName: string | null
}

interface Task {
  id: string
  title: string
  status: string
}

interface Props {
  propertyId: string
  contacts: ContactOption[]
  defaultContactId?: string | null
  propertyAddress: string
  pipeline: string
  prevLeadId: string | null
  nextLeadId: string | null
  autoCall?: boolean
  onClose: () => void
  onNavigateLead: (direction: 'prev' | 'next') => void
  onAutoCallDone?: () => void
  onEndCall: (data: {
    callId: string | null
    callStartedAt: Date
    contactName: string
    contactPhone: string
    propertyAddress: string
    selectedContact: ContactOption
  }) => void
}

type NumberPreference = 'once' | 'default'

/* ─── Component ──────────────────────────────────────────────────────── */

export function CallPanel({
  propertyId,
  contacts,
  defaultContactId,
  propertyAddress,
  pipeline,
  prevLeadId,
  nextLeadId,
  autoCall,
  onClose,
  onNavigateLead,
  onAutoCallDone,
  onEndCall,
}: Props) {
  // Contact cycling — start at the default contact if provided
  const defaultIdx = defaultContactId
    ? Math.max(0, contacts.findIndex((c) => c.id === defaultContactId))
    : 0
  const [contactIndex, setContactIndex] = useState(defaultIdx)
  const contact = contacts[contactIndex] ?? contacts[0]

  // Twilio numbers
  const [twilioNumbers, setTwilioNumbers] = useState<TwilioNumber[]>([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [showNumberPicker, setShowNumberPicker] = useState(false)
  const [numberPreference, setNumberPreference] = useState<NumberPreference>('once')
  const [savingDefault, setSavingDefault] = useState(false)

  // Call state
  const [callId, setCallId] = useState<string | null>(null)
  const [callStartedAt, setCallStartedAt] = useState<Date | null>(null)
  const [calling, setCalling] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  // Panel state
  const [minimized, setMinimized] = useState(false)

  /* ─── Fetch Twilio numbers ──────────────────────────────────────── */

  useEffect(() => {
    fetch('/api/twilio-numbers')
      .then((r) => r.json())
      .then((json) => {
        const nums: TwilioNumber[] = json.data ?? []
        setTwilioNumbers(nums)
        if (nums.length > 0) setSelectedNumber(nums[0].number)
      })
      .catch(() => {})
  }, [])

  /* ─── Fetch tasks ───────────────────────────────────────────────── */

  useEffect(() => {
    setTasksLoading(true)
    fetch(`/api/tasks?propertyId=${propertyId}&status=pending`)
      .then((r) => r.json())
      .then((json) => {
        setTasks(json.data ?? json.tasks ?? [])
      })
      .catch(() => {})
      .finally(() => setTasksLoading(false))
  }, [propertyId])

  /* ─── Auto-call when autoCall prop is set ────────────────────────── */

  useEffect(() => {
    if (autoCall && twilioNumbers.length > 0 && contacts.length > 0 && !inCall && !calling) {
      startCall()
    }
  }, [autoCall, twilioNumbers]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Call timer ────────────────────────────────────────────────── */

  useEffect(() => {
    if (!inCall || !callStartedAt) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - callStartedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [inCall, callStartedAt])

  const fmtTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  /* ─── Handlers ──────────────────────────────────────────────────── */

  function cycleContact(dir: 'prev' | 'next') {
    setContactIndex((i) => {
      if (dir === 'next') return (i + 1) % contacts.length
      return (i - 1 + contacts.length) % contacts.length
    })
  }

  async function handleSelectNumber(num: string) {
    setSelectedNumber(num)
  }

  async function confirmNumberChoice() {
    if (numberPreference === 'default') {
      setSavingDefault(true)
      try {
        await fetch(`/api/leads/${propertyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultOutboundNumber: selectedNumber }),
        })
      } catch {
        // silent
      } finally {
        setSavingDefault(false)
      }
    }
    setShowNumberPicker(false)
  }

  async function startCall() {
    if (!contact?.phone) {
      setError('No phone number available')
      return
    }
    setCalling(true)
    setError(null)
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: contact.phone,
          propertyId,
          fromNumber: selectedNumber || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to start call')
      setCallId(json.data?.id ?? null)
      setCallStartedAt(new Date())
      setInCall(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error starting call')
    } finally {
      setCalling(false)
    }
  }

  function handleEndCall() {
    onEndCall({
      callId,
      callStartedAt: callStartedAt ?? new Date(),
      contactName: contact?.name ?? 'Unknown',
      contactPhone: contact?.phone ?? '',
      propertyAddress,
      selectedContact: contacts[contactIndex],
    })
    setInCall(false)
    setCallId(null)
    setCallStartedAt(null)
    setElapsed(0)
  }

  function dispatchAction(action: string) {
    window.dispatchEvent(
      new CustomEvent('call-panel-action', { detail: { action } })
    )
  }

  /* ─── Minimized bar ─────────────────────────────────────────────── */

  if (minimized && inCall) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-green-600 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-2 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <Phone className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {contact?.name ?? 'Call'}
            </span>
            <span className="text-sm text-green-100">{contact?.phone}</span>
            <span className="text-sm font-mono bg-green-700 px-2 py-0.5 rounded">
              {fmtTime(elapsed)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMinimized(false)}
              className="flex items-center gap-1 text-xs font-medium bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
              Expand
            </button>
            <button
              onClick={handleEndCall}
              className="flex items-center gap-1 text-xs font-medium bg-white text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              End & Log
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Full panel ────────────────────────────────────────────────── */

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[360px] z-50 bg-white border-l border-gray-200 shadow-xl flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-green-600" />
          <span className="font-semibold text-sm text-gray-900">
            Call Panel
          </span>
          {inCall && (
            <span className="text-xs font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded-lg">
              {fmtTime(elapsed)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {inCall && (
            <button
              onClick={() => setMinimized(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* ─ A. Outbound Number ──────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Call / SMS / RVM from number
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-gray-900">
              {selectedNumber || 'No numbers loaded'}
            </span>
            <button
              onClick={() => setShowNumberPicker(!showNumberPicker)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              Change
            </button>
          </div>

          {showNumberPicker && (
            <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-3 space-y-2">
              <div className="max-h-32 overflow-y-auto space-y-1">
                {twilioNumbers.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleSelectNumber(n.number)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors ${
                      selectedNumber === n.number
                        ? 'bg-blue-100 text-blue-800 font-medium'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    {n.friendlyName
                      ? `${n.friendlyName} (${n.number})`
                      : n.number}
                  </button>
                ))}
                {twilioNumbers.length === 0 && (
                  <p className="text-xs text-gray-400 py-1">
                    No Twilio numbers found
                  </p>
                )}
              </div>

              <div className="border-t border-gray-200 pt-2 space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="numPref"
                    checked={numberPreference === 'once'}
                    onChange={() => setNumberPreference('once')}
                    className="accent-blue-600"
                  />
                  Use for this call only
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="numPref"
                    checked={numberPreference === 'default'}
                    onChange={() => setNumberPreference('default')}
                    className="accent-blue-600"
                  />
                  Set as default for this lead
                </label>
              </div>

              <button
                onClick={confirmNumberChoice}
                disabled={savingDefault}
                className="w-full text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {savingDefault ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          )}
        </div>

        {/* ─ B. Current Callee ───────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              Current Callee ({contactIndex + 1}/{contacts.length})
            </p>
            {contacts.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => cycleContact('prev')}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Previous contact"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => cycleContact('next')}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Next contact"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {contact ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-900">
                {contact.name}
              </p>
              {contact.type && (
                <p className="text-xs text-gray-500 capitalize">
                  {contact.type}
                </p>
              )}
              <p className="text-sm font-mono text-gray-700">{contact.phone}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No contacts available</p>
          )}

          {/* Call in progress indicator */}
          {inCall && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
              <span className="text-sm text-green-700 font-medium">
                Connecting...
              </span>
              <span className="text-xs font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded ml-auto">
                {fmtTime(elapsed)}
              </span>
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}

          {/* Call / End button */}
          <div className="mt-3">
            {!inCall ? (
              <button
                onClick={startCall}
                disabled={calling || !contact?.phone}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50 transition-colors active:scale-[0.98]"
              >
                {calling ? (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  <Phone className="w-4 h-4" />
                )}
                {calling ? 'Connecting...' : 'Call Lead'}
              </button>
            ) : (
              <button
                onClick={handleEndCall}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors active:scale-[0.98]"
              >
                End & Log Outcome
              </button>
            )}
          </div>
        </div>

        {/* ─ C. Prev / Next Lead ─────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex gap-2">
            <button
              onClick={() => onNavigateLead('prev')}
              disabled={!prevLeadId}
              className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 text-xs font-medium py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev Lead
            </button>
            <button
              onClick={() => onNavigateLead('next')}
              disabled={!nextLeadId}
              className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 text-xs font-medium py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next Lead
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ─ D. My Assigned Tasks ────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">
            My Assigned Tasks ({tasks.length})
          </h3>

          {tasksLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-5 bg-gray-100 rounded animate-pulse"
                />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-gray-400">No pending tasks</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 truncate">
                    {task.title}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── E. Bottom Action Bar ───────────────────────────────────── */}
      <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
        <div className="grid grid-cols-4 gap-1.5 mb-1.5">
          <ActionButton
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            label="Send SMS"
            onClick={() => dispatchAction('sms')}
          />
          <ActionButton
            icon={<Zap className="w-3.5 h-3.5" />}
            label="Drip"
            onClick={() => dispatchAction('drip')}
          />
          <ActionButton
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Appt."
            onClick={() => dispatchAction('appointment')}
          />
          <ActionButton
            icon={<ListTodo className="w-3.5 h-3.5" />}
            label="Task"
            onClick={() => dispatchAction('task')}
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton
            icon={<FileText className="w-3.5 h-3.5" />}
            label="Leave Note"
            onClick={() => dispatchAction('note')}
          />
          <ActionButton
            icon={<Pencil className="w-3.5 h-3.5" />}
            label="Edit Lead"
            onClick={() => dispatchAction('edit')}
          />
        </div>
      </div>
    </div>
  )
}

/* ─── Action button sub-component ────────────────────────────────────── */

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-gray-600 hover:bg-white hover:text-blue-600 hover:shadow-sm border border-transparent hover:border-gray-200 transition-all text-[11px] font-medium"
    >
      {icon}
      {label}
    </button>
  )
}
