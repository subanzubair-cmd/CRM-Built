'use client'

/**
 * useCallRecorder — captures the WebRTC peer's audio (customer + agent
 * mic mixed) via MediaRecorder and uploads chunks to the CRM as the
 * call progresses. Fully CRM-side recording: provider never hosts the
 * audio file, MinIO is the source of truth.
 *
 * Lifecycle:
 *   call goes active → grab remote stream from rawCall + local mic →
 *   mix via Web Audio → MediaRecorder.start(5000) → for each chunk POST
 *   to /api/calls/[id]/recording-chunk?seq=N. On call end, MediaRecorder
 *   stops, finalizer POSTs `?finalize=true` so the server stitches the
 *   chunks into a single MinIO object.
 *
 * Prefers WebM/Opus (Chrome/Firefox/Edge default). Safari produces MP4.
 * Either is fine — server stores raw bytes; the streaming endpoint
 * serves them with the same Content-Type.
 */

import { useEffect, useRef } from 'react'

interface Args {
  callId: string | null
  rawCall: any | null
  active: boolean
}

const CHUNK_INTERVAL_MS = 5000

export function useCallRecorder({ callId, rawCall, active }: Args): void {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const seqRef = useRef(0)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    if (!active || !callId || !rawCall) return
    if (recorderRef.current) return // already recording for this call

    let cancelled = false
    seqRef.current = 0
    stoppedRef.current = false

    async function start() {
      try {
        // Remote audio = the customer's voice (received from the peer).
        const remoteStream: MediaStream | undefined =
          rawCall.remoteStream ??
          rawCall.peer?.getReceivers?.()
            ?.map((r: RTCRtpReceiver) => r.track)
            ?.filter((t: MediaStreamTrack) => t && t.kind === 'audio')
            ?.reduce((acc: MediaStream, track: MediaStreamTrack) => {
              acc.addTrack(track)
              return acc
            }, new MediaStream())

        if (!remoteStream || remoteStream.getAudioTracks().length === 0) {
          console.warn('[recorder] no remote audio stream available — skipping')
          return
        }

        // Local audio = the agent's mic.
        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          localStream.getTracks().forEach((t) => t.stop())
          return
        }
        localStreamRef.current = localStream

        // Mix both streams via Web Audio so MediaRecorder gets a single track.
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        const dest = ctx.createMediaStreamDestination()
        ctx.createMediaStreamSource(remoteStream).connect(dest)
        ctx.createMediaStreamSource(localStream).connect(dest)

        const mimeType = pickMimeType()
        const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined)
        recorderRef.current = recorder

        recorder.ondataavailable = async (event: BlobEvent) => {
          if (!event.data || event.data.size === 0) return
          const seq = seqRef.current++
          const url = `/api/calls/${callId}/recording-chunk?seq=${seq}`
          try {
            await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': event.data.type || 'application/octet-stream' },
              body: event.data,
              keepalive: true,
            })
          } catch (err) {
            console.warn('[recorder] chunk upload failed seq=', seq, err)
          }
        }

        recorder.onerror = (e) => {
          console.error('[recorder] MediaRecorder error:', e)
        }

        recorder.start(CHUNK_INTERVAL_MS)
      } catch (err) {
        console.error('[recorder] failed to start:', err)
      }
    }

    start()

    return () => {
      cancelled = true
      stop(callId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, callId, rawCall])

  function stop(id: string | null) {
    if (stoppedRef.current) return
    stoppedRef.current = true

    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') {
      try {
        rec.requestData?.()
        rec.stop()
      } catch (err) {
        console.warn('[recorder] stop error:', err)
      }
    }

    // Tear down local mic + audio graph
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null

    // Tell the server the chunks are done so it can stitch them.
    if (id) {
      // Use sendBeacon-safe path so the finalize survives unload.
      const url = `/api/calls/${id}/recording-chunk?finalize=true&total=${seqRef.current}`
      try {
        const blob = new Blob([''], { type: 'text/plain' })
        if (navigator.sendBeacon) navigator.sendBeacon(url, blob)
        else fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
      } catch (err) {
        console.warn('[recorder] finalize beacon failed:', err)
      }
    }
  }
}

/**
 * MediaRecorder mimeType support varies by browser. Prefer Opus in WebM
 * (broadest support); fall back to whatever the browser offers.
 */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ]
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c
    } catch {
      // continue
    }
  }
  return undefined
}
