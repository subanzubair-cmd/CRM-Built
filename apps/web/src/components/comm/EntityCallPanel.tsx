'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatPhone } from '@/lib/phone'
import {
  Phone,
  PhoneOff,
  X,
  Minimize2,
  Maximize2,
  ChevronLeft,
  ChevronRight,
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

type CallOutcome = 'CONNECTED' | 'NOT_CONNECTED' | 'LEFT_VOICEMAIL'

interface Props {
  entityType: 'buyer' | 'vendor'
  entityId: string
  contacts: ContactOption[]
  label: string
  onClose: () => void
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function EntityCallPanel({
  entityType,
  entityId,
  contacts,
  label,
  onClose,
}: Props) {
  // Contact cycling
  const [contactIndex, setContactIndex] = useState(0)
  const contact = contacts[contactIndex] ?? contacts[0]

  // Twilio numbers
  const [twilioNumbers, setTwilioNumbers] = useState<TwilioNumber[]>([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [showNumberPicker, setShowNumberPicker] = useState(false)

  // Call state
  const [callId, setCallId] = useState<string | null>(null)
  const [callStartedAt, setCallStartedAt] = useState<Date | null>(null)

  // WebRTC softphone
  const tx = useTelnyxCall()

  // Hangup on page unload
  useCallCleanup(tx.callId ?? callId)

  const [calling, setCalling] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Guard against double-firing end-call logic
  const endCallFiredRef = useRef(false)
  // Track elapsed seconds at end of call for duration calculation
  const elapsedRef = useRef(0)

  // Post-call disposition form
  const [showDisposition, setShowDisposition] = useState(false)
  const [outcome, setOutcome] = useState<CallOutcome>('CONNECTED')
  const [notes, setNotes] = useState('')
  const [savingDisposition, setSavingDisposition] = useState(false)
  const [dispositionError, setDispositionError] = useState<string | null>(null)

  // Panel state
  const [minimized, setMinimized] = useState(false)

  // Drive local UI from WebRTC hook state
  useEffect(() => {
    if (tx.callId && tx.callId !== callId) {
      setCallId(tx.callId)
    }
    const live = tx.state === 'connecting' || tx.state === 'ringing' || tx.state === 'active'
    if (live && !inCall) {
      setInCall(true)
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

  // Phase label for status pill
  const phaseLabel: string =
    tx.state === 'connecting' ? 'Connecting…'
      : tx.state === 'ringing' ? 'Ringing…'
        : tx.state === 'active' ? 'Connected'
          : tx.state === 'ended' ? 'Call ended'
            : tx.state === 'error' ? 'Failed'
              : 'Idle'

  const phaseClasses =
    tx.state === 'active'
      ? { bg: 'bg-green-50 border-green-200', dot: 'bg-green-500', text: 'text-green-700', timer: 'bg-green-100 text-green-700' }
      : tx.state === 'error'
        ? { bg: 'bg-red-50 border-red-200', dot: 'bg-red-500', text: 'text-red-700', timer: 'bg-red-100 text-red-700' }
        : { bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', text: 'text-amber-700', timer: 'bg-amber-100 text-amber-700' }

  /* ─── Fetch Twilio numbers ─────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false
    fetch('/api/twilio-numbers')
      .then((r) => r.json())
      .then((numsJson) => {
        if (cancelled) return
        const nums: TwilioNumber[] = numsJson?.data ?? []
        setTwilioNumbers(nums)
        if (nums.length > 0) {
          setSelectedNumber((current) => current || nums[0].number)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  /* ─── Call timer ────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!inCall || !callStartedAt) return
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - callStartedAt.getTime()) / 1000)
      setElapsed(secs)
      elapsedRef.current = secs
    }, 1000)
    return () => clearInterval(interval)
  }, [inCall, callStartedAt])

  const fmtTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  /* ─── Handlers ──────────────────────────────────────────────────────── */

  function cycleContact(dir: 'prev' | 'next') {
    setContactIndex((i) => {
      if (dir === 'next') return (i + 1) % contacts.length
      return (i - 1 + contacts.length) % contacts.length
    })
  }

  async function startCall() {
    if (!contact?.phone) {
      setError('No phone number available')
      return
    }
    setCalling(true)
    setError(null)
    try {
      await tx.call({
        toNumber: contact.phone,
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
    tx.hangup().catch(() => {})
    setInCall(false)
    setCallId(null)
    setCallStartedAt(null)
    setElapsed(0)
    // Show inline disposition form
    setShowDisposition(true)
    setMinimized(false)
  }

  // Remote hangup handler
  useEffect(() => {
    if (tx.state === 'ended' && inCall && !endCallFiredRef.current) {
      handleEndCall('remote')
    }
    if (tx.state === 'connecting' || tx.state === 'idle') {
      endCallFiredRef.current = false
    }
  }, [tx.state, inCall]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveDisposition() {
    setSavingDisposition(true)
    setDispositionError(null)
    try {
      const res = await fetch(`/api/${entityType}s/${entityId}/log-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contact?.phone ?? '',
          outcome,
          durationMinutes: Math.max(1, Math.ceil(elapsedRef.current / 60)),
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to save call log')
      }
      onClose()
    } catch (err: any) {
      setDispositionError(err.message)
    } finally {
      setSavingDisposition(false)
    }
  }

  /* ─── Minimized bar ─────────────────────────────────────────────────── */

  if (minimized && inCall) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-green-600 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-2 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <Phone className="w-4 h-4" />
            <span className="text-sm font-semibold">{contact?.name ?? label}</span>
            <span className="text-sm text-green-100">{formatPhone(contact?.phone)}</span>
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

  /* ─── Full panel ────────────────────────────────────────────────────── */

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[360px] z-50 bg-white border-l border-gray-200 shadow-xl flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-green-600" />
          <span className="font-semibold text-sm text-gray-900">Call Panel</span>
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

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Post-call disposition form — shown after call ends */}
        {showDisposition ? (
          <div className="px-4 py-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Log Call Outcome</h3>
              <p className="text-xs text-gray-500">
                {contact?.name ?? label} &middot; {formatPhone(contact?.phone)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Outcome</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as CallOutcome)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <option value="CONNECTED">Connected</option>
                <option value="NOT_CONNECTED">No Answer</option>
                <option value="LEFT_VOICEMAIL">Left Voicemail</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any call notes..."
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
            </div>

            {dispositionError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
                {dispositionError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                disabled={savingDisposition}
                className="flex-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSaveDisposition}
                disabled={savingDisposition}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingDisposition ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                Save &amp; Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ─ A. Outbound Number ────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Calling from number
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-gray-900">
                  {selectedNumber || 'No numbers loaded'}
                </span>
                {twilioNumbers.length > 1 && (
                  <button
                    onClick={() => setShowNumberPicker(!showNumberPicker)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    Change
                  </button>
                )}
              </div>

              {showNumberPicker && twilioNumbers.length > 1 && (
                <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-3 space-y-2">
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {twilioNumbers.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setSelectedNumber(n.number)
                          setShowNumberPicker(false)
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors ${
                          selectedNumber === n.number
                            ? 'bg-blue-100 text-blue-800 font-medium'
                            : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        {n.friendlyName ? `${n.friendlyName} (${n.number})` : n.number}
                      </button>
                    ))}
                    {twilioNumbers.length === 0 && (
                      <p className="text-xs text-gray-400 py-1">No phone numbers found</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ─ B. Current Callee ─────────────────────────────────────── */}
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
                  <p className="text-sm font-semibold text-gray-900">{contact.name}</p>
                  {contact.type && (
                    <p className="text-xs text-gray-500 capitalize">{contact.type}</p>
                  )}
                  <p className="text-sm font-mono text-gray-700">{formatPhone(contact.phone)}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No contacts available</p>
              )}

              {/* Live call status */}
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

              {/* Call / End button */}
              <div className="mt-3">
                {!inCall ? (
                  <button
                    onClick={startCall}
                    disabled={calling || !contact?.phone}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50 transition-colors active:scale-[0.98]"
                  >
                    <Phone className="w-4 h-4" />
                    Call
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
          </>
        )}
      </div>
    </div>
  )
}
