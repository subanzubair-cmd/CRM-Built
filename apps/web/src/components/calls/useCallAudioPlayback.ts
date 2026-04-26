'use client'

/**
 * useCallAudioPlayback — attach the remote (customer) audio stream
 * from a Telnyx WebRTC Call to a hidden <audio> element so the agent
 * actually HEARS the call.
 *
 * The Telnyx SDK exposes the remote stream via call.remoteStream (and
 * via the underlying RTCPeerConnection's receivers as a fallback for
 * SDK versions that don't surface remoteStream directly). It does NOT
 * auto-attach to an audio element — that's the embedder's job.
 *
 * useCallRecorder already taps the same stream for the MediaRecorder
 * mix; this hook is independent so the recorder doesn't need to also
 * play (which would force the recording lifecycle on the playback
 * lifecycle — they're the same in practice but architecturally
 * orthogonal).
 *
 * The hook creates one shared <audio> element on first use (cached on
 * globalThis so HMR doesn't multiply it) and reuses it for every call.
 */

import { useEffect, useRef } from 'react'

const AUDIO_EL_KEY = '__crm_call_audio_el__'

function getOrCreateAudioElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  const g = globalThis as any
  if (g[AUDIO_EL_KEY] && document.body.contains(g[AUDIO_EL_KEY])) {
    return g[AUDIO_EL_KEY] as HTMLAudioElement
  }
  const el = document.createElement('audio')
  el.id = 'crm-call-audio'
  el.autoplay = true
  el.style.display = 'none'
  // Prevent the browser from showing media-session controls for this
  // element — it's a backstage audio sink, not a user-controlled player.
  ;(el as any).controls = false
  document.body.appendChild(el)
  g[AUDIO_EL_KEY] = el
  return el
}

interface Args {
  /** The Telnyx SDK Call instance (rawCall from useTelnyxCall). */
  rawCall: any | null
  /** True while the call is in any live phase (connecting, ringing, active).
   *  We keep the stream attached through ringing so the agent hears the
   *  ringback tone Telnyx feeds back. */
  active: boolean
}

export function useCallAudioPlayback({ rawCall, active }: Args): void {
  const lastSrcRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const audio = getOrCreateAudioElement()
    if (!audio) return

    if (!active || !rawCall) {
      // Tear down: detach stream + pause so an old call's audio
      // doesn't keep playing if the SDK released the stream slowly.
      try {
        audio.pause()
        audio.srcObject = null
      } catch {
        // Safari sometimes throws on srcObject=null during teardown.
      }
      lastSrcRef.current = null
      return
    }

    // Resolve the remote stream. SDK exposes call.remoteStream when
    // available; fall back to gathering audio tracks from peer
    // connection receivers.
    let remoteStream: MediaStream | null = rawCall.remoteStream ?? null
    if (!remoteStream && rawCall.peer?.getReceivers) {
      const tracks = rawCall.peer.getReceivers()
        .map((r: RTCRtpReceiver) => r.track)
        .filter((t: MediaStreamTrack | null): t is MediaStreamTrack => !!t && t.kind === 'audio')
      if (tracks.length > 0) {
        remoteStream = new MediaStream()
        tracks.forEach((t: MediaStreamTrack) => remoteStream!.addTrack(t))
      }
    }

    if (!remoteStream) {
      // Stream not yet available — common during the connecting phase.
      // The hook re-runs whenever rawCall changes; SDK populates
      // remoteStream once the peer connection negotiates.
      return
    }

    if (lastSrcRef.current === remoteStream) return // already attached

    audio.srcObject = remoteStream
    lastSrcRef.current = remoteStream
    audio.play().catch((err) => {
      // Autoplay can be blocked by the browser if the user hasn't
      // interacted with the page recently. The Call button click
      // counts as interaction, so this should rarely fire — but log
      // it so we know.
      console.warn('[call-audio] autoplay blocked or failed:', err)
    })
  }, [rawCall, active])
}
