'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, PhoneOff, X, Minimize2, Maximize2, ExternalLink } from 'lucide-react'
import { useCallCleanup } from '@/components/calls/useCallCleanup'
import { useTelnyxCall } from '@/components/calls/useTelnyxCall'
import { getTelnyxClient } from '@/lib/webrtc/telnyx-client'

interface ActiveCall {
  id: string
  customerPhone: string
  status: string
  direction: string
  startedAt: string
}

interface LeadProperty {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  propertyStatus: string
  activeLeadStage: string | null
  leadType: string
}

interface ListStackingProperty {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  lists: string[]
}

interface CallerLookup {
  caller: { name: string; phone: string | null; type: string | null }
  source: string | null
  leadProperties: LeadProperty[]
  listStacking: ListStackingProperty[]
}

/**
 * Global inbound call notification popup. Polls /api/calls every 3s for
 * ringing inbound calls and shows a REsimpli-style popup with caller
 * identification, matched leads, and Answer/Reject actions.
 */
export function InboundCallNotification() {
  const router = useRouter()
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [lookup, setLookup] = useState<CallerLookup | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // Holds the WebRTC SDK Call instance for in-flight inbound calls so
  // Answer/Reject can act on the right peer connection.
  const [incomingWebrtcCall, setIncomingWebrtcCall] = useState<any | null>(null)

  // Subscribe to WebRTC inbound INVITE events so the popup also fires
  // for browser-routed calls (in addition to the polling fallback for
  // the legacy conference flow).
  useEffect(() => {
    const client = getTelnyxClient()
    // Eagerly connect so the SDK is registered when the first inbound
    // call rings the SIP user. Failure here is OK — the polling fallback
    // still surfaces the call once the webhook creates the row.
    client.ensureReady().catch((err) => console.warn('[inbound] WebRTC connect skipped:', err))

    const offInvite = client.on('invite', (sdkCall: any) => {
      setIncomingWebrtcCall(sdkCall)
    })
    return () => {
      offInvite()
    }
  }, [])

  // Hook the WebRTC softphone for answer/reject so we use the SDK peer
  // connection (and start MediaRecorder) on accept.
  const tx = useTelnyxCall()

  // If the page unloads / loses connection while a call is RINGING here,
  // sendBeacon a hangup so we don't leave a dangling call on the provider.
  useCallCleanup(activeCall?.id ?? null)

  // Poll for inbound ringing calls
  useEffect(() => {
    let cancelled = false

    async function poll() {
      if (cancelled) return
      try {
        const res = await fetch('/api/calls')
        if (!res.ok) return
        const json = await res.json()
        const calls: ActiveCall[] = (json.data ?? []).filter(
          (c: ActiveCall) =>
            c.direction === 'INBOUND' && c.status === 'RINGING' && !dismissed.has(c.id)
        )
        if (calls.length > 0 && !activeCall) {
          setActiveCall(calls[0])
        } else if (activeCall && !calls.find((c) => c.id === activeCall.id)) {
          // call was answered/rejected elsewhere or ended
          setActiveCall(null)
          setLookup(null)
        }
      } catch {
        // ignore
      }
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeCall, dismissed])

  // Lookup caller when a new call is detected
  useEffect(() => {
    if (!activeCall) return
    let cancelled = false
    fetch(`/api/calls/inbound/lookup?phone=${encodeURIComponent(activeCall.customerPhone)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setLookup(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeCall])

  async function handleAnswer() {
    if (!activeCall) return
    // If we have the WebRTC SDK call instance, accept via the peer
    // connection so the audio flows through this browser (and the
    // recorder hook attached inside useTelnyxCall starts capturing).
    // Otherwise fall back to the legacy server-side answer endpoint.
    if (incomingWebrtcCall) {
      await tx.answer(incomingWebrtcCall)
    } else {
      await fetch(`/api/calls/${activeCall.id}/answer`, { method: 'POST' })
    }
    // Navigate to the first matching property if any
    const firstLead = lookup?.leadProperties[0]
    if (firstLead) {
      const pipeline =
        firstLead.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
      const base =
        firstLead.propertyStatus === 'IN_TM'
          ? '/tm'
          : firstLead.propertyStatus === 'IN_INVENTORY'
          ? '/inventory'
          : firstLead.propertyStatus === 'IN_DISPO'
          ? '/dispo'
          : `/leads/${pipeline}`
      router.push(`${base}/${firstLead.id}`)
    }
    setActiveCall(null)
    setLookup(null)
  }

  async function handleReject() {
    if (!activeCall) return
    if (incomingWebrtcCall) {
      await tx.reject(incomingWebrtcCall)
    }
    await fetch(`/api/calls/${activeCall.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'declined' }),
    })
    setDismissed((prev) => new Set(prev).add(activeCall.id))
    setActiveCall(null)
    setLookup(null)
    setIncomingWebrtcCall(null)
  }

  function handleClose() {
    if (!activeCall) return
    setDismissed((prev) => new Set(prev).add(activeCall.id))
    setActiveCall(null)
    setLookup(null)
  }

  if (!activeCall) return null

  const caller = lookup?.caller ?? {
    name: 'Looking up...',
    phone: activeCall.customerPhone,
    type: null,
  }

  // ─── Minimized state: header bar ───
  if (minimized) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-2 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <Phone className="w-4 h-4" />
            <span className="text-sm font-semibold">{caller.name}</span>
            <span className="text-sm text-blue-100">{caller.phone}</span>
            <span className="text-xs bg-blue-700 px-2 py-0.5 rounded">Incoming Call</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMinimized(false)}
              className="flex items-center gap-1 text-xs font-medium bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
              Expand
            </button>
            <button
              onClick={handleAnswer}
              className="flex items-center gap-1 text-xs font-medium bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Phone className="w-3 h-3" />
              Answer
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-1 text-xs font-medium bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <PhoneOff className="w-3 h-3" />
              Reject
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Full popup ───
  return (
    <div className="fixed top-16 right-4 z-[9999] w-[380px] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-blue-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
          <Phone className="w-4 h-4 text-blue-700" />
          <span className="text-sm font-semibold text-blue-900">Incoming Call</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1 rounded hover:bg-white/60 text-gray-500 transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-white/60 text-gray-500 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
        {/* Caller identification */}
        <div className="text-center mb-3">
          <p className="text-lg font-semibold text-gray-900">{caller.name}</p>
          <p className="text-sm text-gray-600 font-mono">{caller.phone}</p>
          {caller.type && (
            <span className="inline-block mt-1 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {caller.type}
            </span>
          )}
        </div>

        {/* Source */}
        {lookup?.source && (
          <p className="text-center text-xs text-gray-500 mb-3">
            Source: <span className="font-medium text-gray-700">{lookup.source}</span>
          </p>
        )}

        {/* Lead Properties */}
        {lookup && lookup.leadProperties.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">
              Lead Properties ({lookup.leadProperties.length})
            </p>
            <div className="space-y-1.5">
              {lookup.leadProperties.map((p) => {
                const addr = [p.streetAddress, p.city, p.state].filter(Boolean).join(', ')
                const pipeline = p.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
                const base =
                  p.propertyStatus === 'IN_TM'
                    ? '/tm'
                    : p.propertyStatus === 'IN_INVENTORY'
                    ? '/inventory'
                    : p.propertyStatus === 'IN_DISPO'
                    ? '/dispo'
                    : p.propertyStatus === 'SOLD'
                    ? '/sold'
                    : `/leads/${pipeline}`
                return (
                  <a
                    key={p.id}
                    href={`${base}/${p.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 p-2 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-blue-700 truncate">{addr}</p>
                      <p className="text-[10px] text-gray-500">
                        {(p.activeLeadStage ?? p.propertyStatus).replace(/_/g, ' ')}
                      </p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {/* List Stacking Properties */}
        {lookup && lookup.listStacking.length > 0 && (
          <div className="mb-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">
              List Stacking Properties ({lookup.listStacking.length})
            </p>
            <div className="space-y-2">
              {lookup.listStacking.map((p) => {
                const addr = [p.streetAddress, p.city, p.state].filter(Boolean).join(', ')
                return (
                  <div key={p.id} className="p-2 border border-gray-100 rounded-lg">
                    <p className="text-sm text-gray-900 truncate">{addr}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.lists.map((list) => (
                        <span
                          key={list}
                          className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                        >
                          {list}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* No match */}
        {lookup && lookup.leadProperties.length === 0 && lookup.listStacking.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-2">
            Unknown caller — no matching leads in the system.
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
        <button
          onClick={handleAnswer}
          className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors active:scale-95"
        >
          <Phone className="w-4 h-4" />
          Answer
        </button>
        <button
          onClick={handleReject}
          className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 bg-white hover:bg-red-50 text-red-600 text-sm font-medium py-2 rounded-lg transition-colors active:scale-95"
        >
          <PhoneOff className="w-4 h-4" />
          Reject
        </button>
      </div>
    </div>
  )
}
