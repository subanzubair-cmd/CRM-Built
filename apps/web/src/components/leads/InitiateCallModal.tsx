'use client'

import { useState, useEffect, useCallback } from 'react'
import { Phone, X, Minimize2, Maximize2, ChevronDown } from 'lucide-react'
import { CallOutcomeModal } from './CallOutcomeModal'

interface TwilioNumber {
  id: string
  number: string
  friendlyName: string | null
}

interface ContactOption {
  id: string
  name: string
  phone: string
  type?: string
}

interface Props {
  propertyId: string
  contacts: ContactOption[]
  propertyAddress: string
  onClose: () => void
}

type Step = 'configure' | 'calling' | 'outcome'

export function InitiateCallModal({ propertyId, contacts, propertyAddress, onClose }: Props) {
  const [step, setStep] = useState<Step>('configure')
  const [twilioNumbers, setTwilioNumbers] = useState<TwilioNumber[]>([])
  const [fromNumber, setFromNumber] = useState('')
  const [selectedContactId, setSelectedContactId] = useState(contacts[0]?.id ?? '')
  const [callId, setCallId] = useState<string | null>(null)
  const [callStartedAt, setCallStartedAt] = useState<Date | null>(null)
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const selectedContact = contacts.find((c) => c.id === selectedContactId) ?? contacts[0]

  useEffect(() => {
    fetch('/api/twilio-numbers')
      .then((r) => r.json())
      .then((json) => {
        const nums: TwilioNumber[] = json.data ?? []
        setTwilioNumbers(nums)
        if (nums.length > 0) setFromNumber(nums[0].number)
      })
      .catch(() => {})
  }, [])

  // Timer for active call
  useEffect(() => {
    if (step !== 'calling' || !callStartedAt) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - callStartedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [step, callStartedAt])

  const fmtTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  async function startCall() {
    if (!selectedContact?.phone) { setError('No phone number selected'); return }
    setCalling(true)
    setError(null)
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerPhone: selectedContact.phone, propertyId, fromNumber: fromNumber || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to start call')
      setCallId(json.data?.id ?? null)
      setCallStartedAt(new Date())
      setStep('calling')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error starting call')
    } finally {
      setCalling(false)
    }
  }

  if (step === 'outcome') {
    return (
      <CallOutcomeModal
        propertyId={propertyId}
        callId={callId}
        callStartedAt={callStartedAt ?? new Date()}
        contactName={selectedContact?.name ?? 'Unknown'}
        contactPhone={selectedContact?.phone ?? ''}
        propertyAddress={propertyAddress}
        onClose={onClose}
      />
    )
  }

  // ─── Minimized bar (stays on top of everything during active call) ───
  if (minimized && step === 'calling') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-green-600 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-2 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <Phone className="w-4 h-4" />
            <span className="text-sm font-semibold">{selectedContact?.name ?? 'Call'}</span>
            <span className="text-sm text-green-100">{selectedContact?.phone}</span>
            <span className="text-sm font-mono bg-green-700 px-2 py-0.5 rounded">{fmtTime(elapsed)}</span>
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
              onClick={() => setStep('outcome')}
              className="flex items-center gap-1 text-xs font-medium bg-white text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              End & Log
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Full modal ───
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-green-600" />
            <span className="font-semibold text-sm text-gray-900">
              {step === 'configure' ? 'Initiate Call' : 'Call in Progress'}
            </span>
            {step === 'calling' && (
              <span className="text-xs font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded-lg">{fmtTime(elapsed)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {step === 'calling' && (
              <button
                onClick={() => setMinimized(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Property address */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Property</p>
            <p className="text-sm font-medium text-gray-900">{propertyAddress}</p>
          </div>

          {/* Contact picker */}
          {step === 'configure' && contacts.length > 1 ? (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Call Who</label>
              <select
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">
                {selectedContact?.name ?? 'Contact'}
              </p>
              <p className={`text-sm font-mono ${selectedContact?.phone ? 'text-gray-900' : 'text-red-500'}`}>
                {selectedContact?.phone ?? 'No phone number on file'}
              </p>
            </div>
          )}

          {/* Calling state — show selected contact */}
          {step === 'calling' && (
            <>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">{selectedContact?.name ?? 'Contact'}</p>
                <p className="text-sm font-mono text-gray-900">{selectedContact?.phone}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                Connecting… Your phone will ring momentarily. Minimize to continue working on this page.
              </div>
            </>
          )}

          {/* Outbound number */}
          {step === 'configure' && twilioNumbers.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Outbound Number</label>
              <select
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {twilioNumbers.map((n) => (
                  <option key={n.id} value={n.number}>
                    {n.friendlyName ? `${n.friendlyName} (${n.number})` : n.number}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          {step === 'configure' && (
            <>
              <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={startCall}
                disabled={calling || !selectedContact?.phone}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50 transition-colors active:scale-95"
              >
                {calling ? 'Calling…' : 'Call'}
              </button>
            </>
          )}
          {step === 'calling' && (
            <>
              <button
                onClick={() => setMinimized(true)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Minimize
              </button>
              <button
                onClick={() => setStep('outcome')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-xl transition-colors active:scale-95"
              >
                End & Log Outcome
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
