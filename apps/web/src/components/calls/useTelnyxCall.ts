'use client'

/**
 * useTelnyxCall — primary React API for the WebRTC softphone.
 *
 * State machine:
 *   idle    →  call(toNumber)        →  connecting (POST /api/calls/start, then SDK newCall)
 *   connecting → SDK 'ringing' state →  ringing
 *   ringing → SDK 'active' state     →  active   (MediaRecorder starts; see useCallRecorder)
 *   active  →  hangup() | SDK ended  →  ended    (POST /api/calls/[id]/hangup; recorder finalizes)
 *
 * Exposes:
 *   - state, callId, error
 *   - call(toNumber, opts?), hangup(), mute(toggle), answer(), reject()
 *   - peerConnection: the underlying RTCPeerConnection (used by the recorder)
 *   - remoteStream: the audio MediaStream from the customer
 *
 * Independent of CallPanel — InboundCallNotification + future dialer
 * widgets share the same hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTelnyxClient } from '@/lib/webrtc/telnyx-client'
import { useCallRecorder } from '@/components/calls/useCallRecorder'
import { useCallAudioPlayback } from '@/components/calls/useCallAudioPlayback'

export type CallState = 'idle' | 'connecting' | 'ringing' | 'active' | 'ended' | 'error'

export interface CallOptions {
  toNumber: string
  fromNumber?: string
  propertyId?: string
}

export interface UseTelnyxCallApi {
  state: CallState
  callId: string | null
  error: string | null
  isMuted: boolean
  call: (opts: CallOptions) => Promise<void>
  hangup: () => Promise<void>
  answer: (incomingCall?: any) => Promise<void>
  reject: (incomingCall?: any) => Promise<void>
  mute: (toggle?: boolean) => void
  rawCall: any | null // exposed for advanced consumers (recorder hook attaches)
}

export function useTelnyxCall(): UseTelnyxCallApi {
  const [state, setState] = useState<CallState>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [rawCall, setRawCall] = useState<any | null>(null)

  // Recorder lifecycle is driven by call state.
  useCallRecorder({ callId, rawCall, active: state === 'active' })

  // Audio playback — attach the remote stream to a hidden <audio>
  // element so the agent actually hears the customer + ringback.
  // Active during ringing AND active so the agent hears the ringback
  // tone Telnyx feeds back during the connecting/ringing phase.
  useCallAudioPlayback({
    rawCall,
    active: state === 'ringing' || state === 'active' || state === 'connecting',
  })

  const client = useMemo(() => getTelnyxClient(), [])

  // Subscribe to SDK notifications to drive the state machine.
  useEffect(() => {
    const off = client.on('notification', (notification: any) => {
      if (notification?.type !== 'callUpdate' || !notification.call) return
      if (rawCall && notification.call.id !== rawCall.id) return
      const sdkState = String(notification.call.state ?? '').toLowerCase()
      switch (sdkState) {
        case 'requesting':
        case 'trying':
        case 'recovering':
          setState('connecting')
          break
        case 'ringing':
        case 'early':
          setState('ringing')
          break
        case 'active':
          setState('active')
          break
        case 'hangup':
        case 'destroy':
        case 'purge':
          setState('ended')
          break
      }
    })
    return off
  }, [client, rawCall])

  // Handle SDK errors (token expiry, network, etc.).
  useEffect(() => {
    const off = client.on('error', (err: any) => {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    })
    return off
  }, [client])

  const call = useCallback(
    async ({ toNumber, fromNumber, propertyId }: CallOptions) => {
      setError(null)
      setState('connecting')
      try {
        // Server-side: create the ActiveCall row first so we have an id
        // for the recording chunk endpoint and the hangup beacon. Returns
        // { id, fromNumber, callerNumber } — the resolved sender comes
        // from the property's defaultOutboundNumber / campaign / fallback.
        const startRes = await fetch('/api/calls/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toNumber, fromNumber, propertyId }),
        })
        if (!startRes.ok) {
          const json = await startRes.json().catch(() => ({}))
          throw new Error(json.error ?? `Start failed (${startRes.status})`)
        }
        const { id, callerNumber } = await startRes.json()
        setCallId(id)

        const newCall = await client.newCall(toNumber, callerNumber || fromNumber || '')
        setRawCall(newCall)

        // Link the Telnyx call_control_id (= newCall.id) back to our
        // ActiveCall row so when call.hangup fires from the Telnyx
        // webhook, our handler can match by conferenceName and mark
        // the row COMPLETED. Without this, outbound rows started with
        // a 'webrtc-{ts}-{random}' placeholder never match a webhook
        // and stick around in the Live Calls panel.
        const controlId = (newCall as any)?.id ?? null
        if (controlId) {
          fetch(`/api/calls/${id}/link-control-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ controlId }),
          }).catch((err) => {
            console.warn('[useTelnyxCall] link-control-id failed:', err)
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Call failed'
        setError(msg)
        setState('error')
      }
    },
    [client],
  )

  const hangup = useCallback(async () => {
    try {
      if (rawCall) rawCall.hangup()
    } catch (err) {
      console.warn('[useTelnyxCall] hangup error:', err)
    }
    if (callId) {
      // Server-side hangup also runs; idempotent if SDK already terminated.
      fetch(`/api/calls/${callId}/hangup`, { method: 'POST' }).catch(() => {})
    }
    setState('ended')
  }, [rawCall, callId])

  const answer = useCallback(async (incomingCall?: any) => {
    const target = incomingCall ?? rawCall
    if (!target) return
    try {
      target.answer()
      setRawCall(target)
      setState('active')

      // Persist the inbound call against the existing ActiveCall row
      // (created by the Telnyx webhook on call.initiated).
      // The SDK's call.id maps to the call_control_id we already stored
      // in conferenceName on the server side.
      try {
        const lookupRes = await fetch(`/api/calls/by-control-id?id=${encodeURIComponent(target.id ?? '')}`)
        if (lookupRes.ok) {
          const { id } = await lookupRes.json()
          if (id) setCallId(id)
        }
      } catch {
        // Non-fatal; recorder still works once setCallId fires.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Answer failed'
      setError(msg)
      setState('error')
    }
  }, [rawCall])

  const reject = useCallback(async (incomingCall?: any) => {
    const target = incomingCall ?? rawCall
    if (!target) return
    try {
      target.hangup()
    } catch (err) {
      console.warn('[useTelnyxCall] reject error:', err)
    }
    setState('idle')
    setRawCall(null)
  }, [rawCall])

  const mute = useCallback(
    (toggle?: boolean) => {
      if (!rawCall) return
      const next = toggle ?? !isMuted
      try {
        if (next) rawCall.muteAudio?.()
        else rawCall.unmuteAudio?.()
        setIsMuted(next)
      } catch (err) {
        console.warn('[useTelnyxCall] mute error:', err)
      }
    },
    [rawCall, isMuted],
  )

  // Reset transient state when a call ends so the panel can re-arm.
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (state !== 'ended') return
    resetTimer.current = setTimeout(() => {
      setRawCall(null)
      setCallId(null)
      setIsMuted(false)
      setState('idle')
    }, 2000)
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [state])

  return { state, callId, error, isMuted, call, hangup, answer, reject, mute, rawCall }
}
