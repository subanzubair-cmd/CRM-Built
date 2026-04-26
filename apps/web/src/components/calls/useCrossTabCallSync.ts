'use client'

import { useEffect, useRef } from 'react'

/**
 * useCrossTabCallSync — coordinate the inbound-call popup across every
 * CRM tab the user has open in the same browser profile.
 *
 * Behavior:
 *   - When ANY tab notices a ringing inbound call, polling already
 *     surfaces it on every tab independently (each tab hits /api/calls).
 *     So we don't need to broadcast 'ring' — that's natural.
 *   - When a tab CLAIMS the call (Answer or Reject), it broadcasts a
 *     `claim` message with the callId. Every other tab receives it and
 *     dismisses its own popup so only the claiming tab continues to
 *     show the call.
 *   - When a tab HANGS UP a previously-active call, it broadcasts an
 *     `ended` message so other tabs can hide any "On call elsewhere"
 *     UI we might add later.
 *
 * BroadcastChannel API is supported in all evergreen browsers we
 * target. Firefox private mode and very old Safari don't have it —
 * the hook silently no-ops there (tabs continue to ring independently
 * but won't auto-dismiss; user can dismiss manually).
 */
const CHANNEL = 'crm-call-events'

type CallEvent =
  | { type: 'claim'; callId: string }
  | { type: 'ended'; callId: string }

export interface CrossTabCallSyncApi {
  /** Call after Answer or Reject so other tabs dismiss their popups. */
  broadcastClaim: (callId: string) => void
  /** Call after explicit hangup so other tabs clear any active-elsewhere UI. */
  broadcastEnded: (callId: string) => void
}

export function useCrossTabCallSync(args: {
  /** Called when another tab claims (answers/rejects) this call —
   *  receiver should dismiss its popup for that callId. */
  onClaimedElsewhere: (callId: string) => void
  /** Called when another tab ends a call. Currently informational. */
  onEndedElsewhere?: (callId: string) => void
}): CrossTabCallSyncApi {
  const channelRef = useRef<BroadcastChannel | null>(null)
  // Hold the latest callbacks in refs so we register the listener only
  // once (registering on every render thrashes BroadcastChannel).
  const onClaimedRef = useRef(args.onClaimedElsewhere)
  const onEndedRef = useRef(args.onEndedElsewhere)
  useEffect(() => {
    onClaimedRef.current = args.onClaimedElsewhere
    onEndedRef.current = args.onEndedElsewhere
  }, [args.onClaimedElsewhere, args.onEndedElsewhere])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return
    }
    const ch = new BroadcastChannel(CHANNEL)
    channelRef.current = ch

    function onMessage(e: MessageEvent<CallEvent>) {
      const msg = e.data
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'claim' && typeof msg.callId === 'string') {
        onClaimedRef.current?.(msg.callId)
      } else if (msg.type === 'ended' && typeof msg.callId === 'string') {
        onEndedRef.current?.(msg.callId)
      }
    }
    ch.addEventListener('message', onMessage)

    return () => {
      ch.removeEventListener('message', onMessage)
      ch.close()
      channelRef.current = null
    }
  }, [])

  return {
    broadcastClaim(callId: string) {
      try {
        channelRef.current?.postMessage({ type: 'claim', callId } satisfies CallEvent)
      } catch {
        // BroadcastChannel can throw in private windows — silent.
      }
    },
    broadcastEnded(callId: string) {
      try {
        channelRef.current?.postMessage({ type: 'ended', callId } satisfies CallEvent)
      } catch {
        // Silent.
      }
    },
  }
}
