'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Phone,
  PhoneOff,
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
import { useCallCleanup } from '@/components/calls/useCallCleanup'
import { useTelnyxCall } from '@/components/calls/useTelnyxCall'

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

  // WebRTC softphone — primary call path (provider-agnostic at the API
  // layer; today only Telnyx is wired). Replaces the legacy
  // /api/calls conference flow. Local call state mirrors hook state so
  // the existing UI (timer, buttons, minimize) keeps working unchanged.
  const tx = useTelnyxCall()

  // Hangup the active call if the page unloads / loses connection. Posts
  // to /api/calls/[id]/hangup via navigator.sendBeacon — provider-agnostic.
  useCallCleanup(tx.callId ?? callId)

  const [calling, setCalling] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Guard so the remote-hangup useEffect doesn't fire the disposition
  // modal twice when the user clicked End (which itself causes the
  // SDK state to transition to 'ended').
  const endCallFiredRef = useRef(false)

  // Drive the local UI state machine from the WebRTC hook's state.
  // We treat any non-idle/ended/error state as "in call" so the End
  // button is available during the connecting + ringing phases too —
  // operators need to be able to abort a stuck dial.
  useEffect(() => {
    if (tx.callId && tx.callId !== callId) {
      setCallId(tx.callId)
    }
    const live = tx.state === 'connecting' || tx.state === 'ringing' || tx.state === 'active'
    if (live && !inCall) {
      setInCall(true)
      // Timer starts the moment we begin dialing, NOT when the call
      // becomes active — so the operator sees how long the connecting
      // phase is taking instead of a frozen "Connecting...".
      setCallStartedAt((prev) => prev ?? new Date())
    }
    if (tx.state === 'error') {
      setError(tx.error ?? 'Call failed')
      setCalling(false)
      setInCall(false)
    }
    if (tx.state === 'ended' && inCall) {
      setCalling(false)
      setInCall(false)
    }
  }, [tx.callId, tx.state, tx.error, callId, inCall])

  // Human-readable label for the current phase. Drives the green
  // pill so the operator can tell "ringing on their end" apart from
  // "connecting to Telnyx" apart from "we're talking now".
  const phaseLabel: string =
    tx.state === 'connecting' ? 'Connecting…'
      : tx.state === 'ringing' ? 'Ringing…'
        : tx.state === 'active' ? 'Connected'
          : tx.state === 'ended' ? 'Call ended'
            : tx.state === 'error' ? 'Failed'
              : 'Idle'

  // Color the pill differently per phase so glance-state matches text.
  const phaseClasses =
    tx.state === 'active'
      ? { bg: 'bg-green-50 border-green-200', dot: 'bg-green-500', text: 'text-green-700', timer: 'bg-green-100 text-green-700' }
      : tx.state === 'error'
        ? { bg: 'bg-red-50 border-red-200', dot: 'bg-red-500', text: 'text-red-700', timer: 'bg-red-100 text-red-700' }
        : { bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', text: 'text-amber-700', timer: 'bg-amber-100 text-amber-700' }

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  // Panel state
  const [minimized, setMinimized] = useState(false)

  /* ─── Fetch Twilio numbers + lead's saved default ────────────────
   *
   * Two-stage load to keep "Sending From" snappy:
   *
   *   Stage 1 (fast — the dropdown options):
   *     /api/twilio-numbers  →  set list + tentatively pre-select
   *                             nums[0] so the picker is never blank.
   *
   *   Stage 2 (also fast — the saved default):
   *     /api/leads/[id]/sender  →  upgrade selection to the lead's
   *                                 saved defaultOutboundNumber, or
   *                                 the campaign's phone number when
   *                                 no per-lead default is set.
   *
   * Both fetches run in parallel; we don't wait for stage 2 before
   * showing stage 1's result. End priority: lead default > campaign
   * number > nums[0]. The user only sees a "switch" if a saved
   * default exists and differs from nums[0], and that swap happens in
   * the same render tick most of the time. */
  useEffect(() => {
    let cancelled = false
    let appliedSavedDefault = false

    fetch('/api/twilio-numbers')
      .then((r) => r.json())
      .then((numsJson) => {
        if (cancelled) return
        const nums: TwilioNumber[] = numsJson?.data ?? []
        setTwilioNumbers(nums)
        // Only pre-select nums[0] if the saved-default fetch hasn't
        // already set something better. Avoids a flash from default →
        // nums[0] → default.
        if (!appliedSavedDefault && nums.length > 0) {
          setSelectedNumber((current) => current || nums[0].number)
        }
      })
      .catch(() => {})

    fetch(`/api/leads/${propertyId}/sender`)
      .then((r) => r.json())
      .then((senderJson) => {
        if (cancelled) return
        const leadDefault: string | null = senderJson?.defaultOutboundNumber ?? null
        const campaignNumber: string | null = senderJson?.campaignNumber ?? null
        const preferred = leadDefault || campaignNumber
        if (preferred) {
          appliedSavedDefault = true
          setSelectedNumber(preferred)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [propertyId])

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
      // WebRTC dialer: the browser registers as a SIP endpoint via Telnyx
      // and the audio flows through the agent's headset/mic. The hook
      // server-creates the ActiveCall row, then SDK.newCall() initiates.
      // useCallRecorder (mounted inside useTelnyxCall) starts capturing
      // audio + uploading chunks to MinIO once the call goes ACTIVE.
      await tx.call({
        toNumber: contact.phone,
        propertyId,
        fromNumber: selectedNumber || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error starting call')
      setCalling(false)
    }
  }

  function handleEndCall(reason: 'user' | 'remote' = 'user') {
    if (endCallFiredRef.current) return
    endCallFiredRef.current = true
    // Tell WebRTC + server to terminate. Recorder flushes + MinIO finalizes.
    // tx.hangup is idempotent — when reason='remote' the SDK already
    // ended the call, so the SDK call's own .hangup() is a no-op but
    // the server-side POST /api/calls/[id]/hangup still marks the row
    // COMPLETED so it drops off the Live Calls panel.
    tx.hangup().catch(() => {})
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

  // When the OTHER party hangs up — the SDK fires the 'ended' state
  // (via call.hangup notification) without us calling tx.hangup().
  // Auto-fire the same teardown so the timer stops, the server marks
  // the row COMPLETED, and the call disposition modal opens for the
  // agent to log the outcome.
  useEffect(() => {
    if (tx.state === 'ended' && inCall && !endCallFiredRef.current) {
      handleEndCall('remote')
    }
    // Reset the guard when the next call starts.
    if (tx.state === 'connecting' || tx.state === 'idle') {
      endCallFiredRef.current = false
    }
  }, [tx.state, inCall]) // eslint-disable-line react-hooks/exhaustive-deps

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
              onClick={() => handleEndCall('user')}
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
                    No phone numbers found
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

          {/* Live call status — visible from "Connecting…" through
              "Ringing…" through "Connected". Timer ticks the whole
              time so the operator sees how long each phase took. */}
          {inCall && (
            <div className={`mt-3 ${phaseClasses.bg} border rounded-lg px-3 py-2 flex items-center gap-2`}>
              <div className={`w-2 h-2 ${phaseClasses.dot} rounded-full animate-pulse flex-shrink-0`} />
              <span className={`text-sm ${phaseClasses.text} font-medium`}>{phaseLabel}</span>
              <span className={`text-xs font-mono ${phaseClasses.timer} px-2 py-0.5 rounded ml-auto tabular-nums`}>
                {fmtTime(elapsed)}
              </span>
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}

          {/* Call / End button — End is ALWAYS available during any
              live phase (connecting, ringing, active) so the operator
              can abort a slow or stuck dial. */}
          <div className="mt-3">
            {!inCall ? (
              <button
                onClick={startCall}
                disabled={calling || !contact?.phone}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50 transition-colors active:scale-[0.98]"
              >
                <Phone className="w-4 h-4" />
                Call Lead
              </button>
            ) : (
              <button
                onClick={() => handleEndCall('user')}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors active:scale-[0.98]"
              >
                <PhoneOff className="w-4 h-4" />
                {tx.state === 'active' ? 'End & Log Outcome' : 'End Call'}
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
