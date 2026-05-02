'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Phone, PhoneOff, ExternalLink } from 'lucide-react'
import { formatPhone } from '@/lib/phone'
import { useTabTitleIndicator } from '@/components/calls/useTabTitleIndicator'
import { useCrossTabCallSync } from '@/components/calls/useCrossTabCallSync'

/**
 * ActiveCallBar — persistent on-call header strip.
 *
 * Renders ONLY when this tab is the one that answered the current
 * inbound call (or placed an outbound one). Other tabs' bars show
 * nothing — they get a hidden state via the BroadcastChannel claim
 * message in useCrossTabCallSync.
 *
 * Survives any client-side navigation because it lives in the (app)
 * layout. The View Lead link uses next/link's <Link> so navigation is
 * client-side and never tears down the WebRTC peer connection or this
 * bar's React state.
 *
 * Hangup is the ONLY way to end the call from the bar — explicit user
 * action, never automatic. Tab refresh / close still ends the call
 * (handled by useCallCleanup attached at the popup level).
 */

interface ActiveCall {
  id: string
  customerPhone: string
  status: string
  direction: string
  propertyId?: string | null
}

interface CallerLookup {
  caller: { name: string; phone: string | null; type: string | null }
  leadProperties: Array<{
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    propertyStatus: string
    leadType: string
  }>
}

function leadDetailUrl(p: { id: string; propertyStatus: string; leadType: string }): string {
  const pipeline = p.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
  switch (p.propertyStatus) {
    case 'IN_TM':
      return `/tm/${p.id}`
    case 'IN_INVENTORY':
      return `/inventory/${p.id}`
    case 'IN_DISPO':
      return `/dispo/${p.id}`
    case 'SOLD':
      return `/sold/${p.id}`
    default:
      return `/leads/${pipeline}/${p.id}`
  }
}

export function ActiveCallBar() {
  // Tracks the call ID THIS tab claimed (Answer or Outbound). Stored
  // in localStorage so a soft-refresh of a single page within the app
  // doesn't lose the state — the bar reappears on remount.
  const [callId, setCallId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem('crm.activeCall.id') || null
    } catch {
      return null
    }
  })
  const [call, setCall] = useState<ActiveCall | null>(null)
  const [lookup, setLookup] = useState<CallerLookup | null>(null)
  const [hanging, setHanging] = useState(false)

  // Tab title shows 🟢 while bar is mounted with an ACTIVE call.
  useTabTitleIndicator(call?.status === 'ACTIVE' ? 'active' : null)

  // Listen for "this call ended elsewhere" broadcasts so the bar
  // clears if another tab hangs up the call we were also showing.
  useCrossTabCallSync({
    onClaimedElsewhere() {
      // We don't auto-clear here — only on explicit hangup or polling
      // showing the call is COMPLETED. A 'claim' is for inbound popup
      // dismissal, not active-call termination.
    },
    onEndedElsewhere(endedId) {
      if (endedId === callId) {
        clearLocal()
      }
    },
  })

  // Other tabs can announce a claim — listen via plain custom event so
  // when the popup elsewhere does broadcastClaim AND this tab WAS the
  // claimer, we know to set callId here. The popup posts on the same
  // BroadcastChannel; we hook a second listener here.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel('crm-call-events')
    function onMessage(e: MessageEvent<any>) {
      const msg = e.data
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'this-tab-answered' && typeof msg.callId === 'string') {
        setCallId(msg.callId)
        try {
          window.localStorage.setItem('crm.activeCall.id', msg.callId)
        } catch {}
      }
      if (msg.type === 'this-tab-hangup' && msg.callId === callId) {
        clearLocal()
      }
    }
    ch.addEventListener('message', onMessage)
    return () => {
      ch.removeEventListener('message', onMessage)
      ch.close()
    }
  }, [callId])

  // Poll the active call by ID so we drop the bar when the call ends.
  const callIdRef = useRef(callId)
  useEffect(() => {
    callIdRef.current = callId
  }, [callId])

  useEffect(() => {
    if (!callId) {
      setCall(null)
      setLookup(null)
      return
    }
    let cancelled = false
    async function tick() {
      try {
        const res = await fetch('/api/calls')
        if (!res.ok) return
        const json = await res.json()
        const all = (json.data ?? []) as ActiveCall[]
        const match = all.find((c) => c.id === callIdRef.current)
        if (cancelled) return
        if (!match || match.status === 'COMPLETED' || match.status === 'REJECTED') {
          clearLocal()
          return
        }
        setCall(match)
      } catch {
        // ignore
      }
    }
    tick()
    const interval = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [callId])

  // Caller lookup so the bar shows the contact name + lead link.
  useEffect(() => {
    if (!call) return
    let cancelled = false
    fetch(`/api/calls/inbound/lookup?phone=${encodeURIComponent(call.customerPhone)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setLookup(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [call])

  function clearLocal() {
    setCallId(null)
    setCall(null)
    setLookup(null)
    try {
      window.localStorage.removeItem('crm.activeCall.id')
    } catch {}
  }

  async function handleHangup() {
    if (!callId) return
    setHanging(true)
    try {
      await fetch(`/api/calls/${callId}/hangup`, { method: 'POST' })
      // Broadcast so other tabs (if they were tracking) can clean up.
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const ch = new BroadcastChannel('crm-call-events')
          ch.postMessage({ type: 'this-tab-hangup', callId })
          ch.postMessage({ type: 'ended', callId })
          ch.close()
        }
      } catch {}
      clearLocal()
    } finally {
      setHanging(false)
    }
  }

  if (!call) return null

  const caller = lookup?.caller ?? {
    name: 'Caller',
    phone: call.customerPhone,
    type: null,
  }
  const firstLead = lookup?.leadProperties?.[0]
  const leadHref = firstLead ? leadDetailUrl(firstLead) : null
  const leadAddress = firstLead
    ? [firstLead.streetAddress, firstLead.city, firstLead.state].filter(Boolean).join(', ')
    : null

  return (
    <div className="bg-emerald-600 text-white shadow-md flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-1.5 gap-3 text-sm">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse flex-shrink-0" />
          <Phone className="w-4 h-4 flex-shrink-0" />
          <span className="font-semibold truncate">On Call · {caller.name}</span>
          <span className="text-emerald-100 font-mono text-xs truncate">{formatPhone(caller.phone)}</span>
          {leadHref && (
            <Link
              href={leadHref}
              className="inline-flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-800 px-2.5 py-1 rounded-md transition-colors flex-shrink-0"
              title="Open the lead detail page (no refresh — call stays connected)"
            >
              <ExternalLink className="w-3 h-3" />
              {leadAddress || 'View Lead'}
            </Link>
          )}
        </div>
        <button
          onClick={handleHangup}
          disabled={hanging}
          className="flex items-center gap-1 text-xs font-medium bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          <PhoneOff className="w-3 h-3" />
          {hanging ? 'Hanging up…' : 'Hang up'}
        </button>
      </div>
    </div>
  )
}
