'use client'

/**
 * useCallAudioPlayback — attach the remote (customer) audio stream
 * from a Telnyx WebRTC Call to a hidden <audio> element so the agent
 * actually HEARS the call.
 *
 * The Telnyx SDK builds a RTCPeerConnection internally; the audio
 * track arrives ASYNCHRONOUSLY after the call instance exists. The
 * earlier "check rawCall.remoteStream once on state change" approach
 * lost the race — by the time the effect ran, the track wasn't there
 * yet; by the time the track arrived, no effect was watching.
 *
 * This version hooks `peer.ontrack` (and `peer.onaddstream` for older
 * browsers) so we react the moment Telnyx delivers an audio track. It
 * also retries getReceivers() periodically as a belt for SDK builds
 * that bypass the standard track event.
 *
 * Heavy console logging on every step so the dev console shows
 * exactly which path delivered the stream.
 */

import { useEffect, useRef } from 'react'

const AUDIO_EL_ID = 'crm-call-remote-audio'

function getOrCreateAudioElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  const existing = document.getElementById(AUDIO_EL_ID) as HTMLAudioElement | null
  if (existing) return existing
  const el = document.createElement('audio')
  el.id = AUDIO_EL_ID
  el.autoplay = true
  ;(el as any).playsInline = true
  el.style.display = 'none'
  document.body.appendChild(el)
  console.log('[call-audio] created hidden <audio id=' + AUDIO_EL_ID + '>')
  return el
}

interface Args {
  /** The Telnyx SDK Call instance (rawCall from useTelnyxCall). */
  rawCall: any | null
  /** True during connecting / ringing / active. Detach on idle/ended. */
  active: boolean
}

export function useCallAudioPlayback({ rawCall, active }: Args): void {
  const attachedStreamRef = useRef<MediaStream | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const audio = getOrCreateAudioElement()
    if (!audio) return

    // Cleanup previous attachment.
    cleanupRef.current?.()
    cleanupRef.current = null

    if (!active || !rawCall) {
      try {
        audio.pause()
        audio.srcObject = null
      } catch {
        /* Safari throws on srcObject=null sometimes — non-fatal. */
      }
      attachedStreamRef.current = null
      return
    }

    /** Build a stream from the receivers and attach it. Idempotent. */
    function attachFromPeer(reason: string) {
      if (!audio) return
      const peer: RTCPeerConnection | undefined = rawCall.peer
      if (!peer) {
        console.warn('[call-audio] no peer on rawCall yet (' + reason + ')')
        return
      }
      try {
        const audioTracks = peer
          .getReceivers()
          .map((r) => r.track)
          .filter((t): t is MediaStreamTrack => !!t && t.kind === 'audio' && t.readyState === 'live')
        if (audioTracks.length === 0) {
          console.log('[call-audio] no live audio tracks yet via ' + reason)
          return
        }
        const stream = new MediaStream()
        audioTracks.forEach((t) => stream.addTrack(t))
        if (attachedStreamRef.current === stream) return
        audio.srcObject = stream
        attachedStreamRef.current = stream
        audio.play()
          .then(() => console.log('[call-audio] PLAYING via ' + reason + ' (' + audioTracks.length + ' track)'))
          .catch((err) => console.warn('[call-audio] play() failed via ' + reason + ':', err))
      } catch (err) {
        console.warn('[call-audio] attachFromPeer threw via ' + reason + ':', err)
      }
    }

    // 1) Attach whatever's already there (call may have transitioned
    //    to active before this effect ran).
    if (rawCall.remoteStream) {
      audio.srcObject = rawCall.remoteStream
      attachedStreamRef.current = rawCall.remoteStream
      audio.play()
        .then(() => console.log('[call-audio] PLAYING via rawCall.remoteStream'))
        .catch((err) => console.warn('[call-audio] play() failed via remoteStream:', err))
    } else {
      attachFromPeer('initial getReceivers')
    }

    // 2) Hook peer.ontrack so we attach the moment Telnyx delivers an
    //    audio track. This is the canonical WebRTC event for inbound
    //    media.
    const peer: RTCPeerConnection | undefined = rawCall.peer
    let onTrack: ((e: RTCTrackEvent) => void) | null = null
    if (peer && typeof peer.addEventListener === 'function') {
      onTrack = (e: RTCTrackEvent) => {
        console.log('[call-audio] peer.ontrack fired: kind=' + e.track.kind + ' state=' + e.track.readyState)
        if (e.track.kind !== 'audio') return
        // Use the first MediaStream the event provides if available,
        // otherwise build from receivers (covers older Safari).
        const stream = e.streams?.[0] ?? null
        if (stream) {
          if (attachedStreamRef.current !== stream) {
            audio.srcObject = stream
            attachedStreamRef.current = stream
            audio.play()
              .then(() => console.log('[call-audio] PLAYING via peer.ontrack stream'))
              .catch((err) => console.warn('[call-audio] play() ontrack failed:', err))
          }
        } else {
          attachFromPeer('ontrack-getReceivers')
        }
      }
      peer.addEventListener('track', onTrack)
    }

    // 3) Belt: poll receivers for up to 10s in case neither remoteStream
    //    nor ontrack fired (some SDK builds bypass them). 250ms cadence.
    let pollCount = 0
    const pollInterval = setInterval(() => {
      pollCount++
      if (attachedStreamRef.current) {
        clearInterval(pollInterval)
        return
      }
      attachFromPeer('poll #' + pollCount)
      if (pollCount >= 40) {
        clearInterval(pollInterval)
        if (!attachedStreamRef.current) {
          console.warn('[call-audio] gave up after 10s — no audio track ever arrived')
        }
      }
    }, 250)

    cleanupRef.current = () => {
      clearInterval(pollInterval)
      if (peer && onTrack) {
        try {
          peer.removeEventListener('track', onTrack)
        } catch {
          /* ignore */
        }
      }
    }
  }, [rawCall, active])
}
