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
 *
 * NOTE on peer resolution: the Telnyx SDK wraps the real
 * RTCPeerConnection inside `call.peer.instance` / `.peerConnection` /
 * `.pc` (build-dependent). `call.peer` itself is NOT a peer connection
 * and `getReceivers` on it throws. The `getRealPeer` helper below
 * walks the wrapper to find the actual peer — same pattern as
 * useCallAudioPlayback, where this exact mistake caused the "no audio"
 * regression earlier.
 */

import { useEffect, useRef } from 'react'

interface Args {
  callId: string | null
  rawCall: any | null
  active: boolean
}

const CHUNK_INTERVAL_MS = 5000
const REMOTE_TRACK_POLL_MS = 250
const REMOTE_TRACK_POLL_LIMIT = 40 // 10s total

export function useCallRecorder({ callId, rawCall, active }: Args): void {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const seqRef = useRef(0)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const stoppedRef = useRef(false)
  const startTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Counts in-flight chunk uploads (including retries). The finalize
  // beacon must wait for these to drain — otherwise we tell the
  // server "total=N" while chunk N-1 is still mid-retry, the server
  // can't fetch it, and the recording loses its last 5–10s.
  const pendingUploadsRef = useRef(0)
  const pendingResolveRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!active || !callId || !rawCall) return
    if (recorderRef.current) return // already recording for this call

    let cancelled = false
    seqRef.current = 0
    stoppedRef.current = false

    /** Walk the SDK wrapper to find the actual RTCPeerConnection. */
    function getRealPeer(): RTCPeerConnection | null {
      const peer = rawCall?.peer
      if (peer) {
        const candidates = [peer.instance, peer.peerConnection, peer.pc]
        for (const c of candidates) {
          if (c && typeof c.getReceivers === 'function') {
            return c as RTCPeerConnection
          }
        }
      }
      const alt = rawCall?.rtcPeer ?? rawCall?.peerConnection
      if (alt && typeof alt.getReceivers === 'function') {
        return alt as RTCPeerConnection
      }
      return null
    }

    /** Build a MediaStream from the receivers' live audio tracks, or
     *  return null if none are available yet. */
    function getRemoteStream(): MediaStream | null {
      // Some SDK builds expose this directly when the call is fully up.
      if (rawCall?.remoteStream instanceof MediaStream) {
        const tracks = rawCall.remoteStream.getAudioTracks?.() ?? []
        if (tracks.length > 0) return rawCall.remoteStream
      }
      const peer = getRealPeer()
      if (!peer) return null
      try {
        const tracks = peer
          .getReceivers()
          .map((r) => r.track)
          .filter(
            (t): t is MediaStreamTrack =>
              !!t && t.kind === 'audio' && t.readyState === 'live',
          )
        if (tracks.length === 0) return null
        const stream = new MediaStream()
        tracks.forEach((t) => stream.addTrack(t))
        return stream
      } catch (err) {
        console.warn('[recorder] getRemoteStream failed:', err)
        return null
      }
    }

    async function start(remoteStream: MediaStream) {
      try {
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
          // Hours-long calls run thousands of chunks — a transient
          // network blip should NOT lose any. Retry up to 3 times with
          // exponential backoff. NOTE: do NOT use `keepalive: true` —
          // Chrome's 64 KB keepalive body limit silently rejects WebM
          // chunks that carry the init segment. Mid-call uploads happen
          // while the tab is alive so plain fetch is correct.
          //
          // Track in-flight uploads on a counter so the stop()
          // sequence can await pending retries before firing the
          // finalize beacon — otherwise the last chunk is still in a
          // backoff sleep when finalize tells the server "total=N".
          const blob = event.data
          pendingUploadsRef.current++
          try {
            const maxAttempts = 3
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                const res = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': blob.type || 'application/octet-stream' },
                  body: blob,
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return
              } catch (err) {
                if (attempt === maxAttempts) {
                  console.warn(
                    `[recorder] chunk seq=${seq} dropped after ${maxAttempts} attempts:`,
                    err,
                  )
                  return
                }
                const backoffMs = 500 * 2 ** (attempt - 1) // 500, 1000, 2000
                await new Promise((r) => setTimeout(r, backoffMs))
              }
            }
          } finally {
            pendingUploadsRef.current--
            if (pendingUploadsRef.current === 0 && pendingResolveRef.current) {
              const resolve = pendingResolveRef.current
              pendingResolveRef.current = null
              resolve()
            }
          }
        }

        recorder.onerror = (e) => {
          console.error('[recorder] MediaRecorder error:', e)
        }

        recorder.start(CHUNK_INTERVAL_MS)
        console.log(
          `[recorder] started for call ${callId} mime=${mimeType ?? 'default'} ` +
            `tracks(remote=${remoteStream.getAudioTracks().length}, local=${localStream.getAudioTracks().length})`,
        )
      } catch (err) {
        console.error('[recorder] failed to start:', err)
      }
    }

    /**
     * Try to attach the remote stream now, else poll for up to ~10s.
     * The same race that bit useCallAudioPlayback bites here: the
     * 'active' state can fire before Telnyx has actually attached the
     * inbound audio track to the peer connection.
     */
    let pollCount = 0
    const tryStart = () => {
      if (cancelled || recorderRef.current) return true
      const stream = getRemoteStream()
      if (!stream) return false
      // Have a live remote audio track — kick off recording.
      start(stream)
      return true
    }

    if (!tryStart()) {
      startTimerRef.current = setInterval(() => {
        pollCount++
        if (tryStart()) {
          if (startTimerRef.current) clearInterval(startTimerRef.current)
          startTimerRef.current = null
          return
        }
        if (pollCount >= REMOTE_TRACK_POLL_LIMIT) {
          if (startTimerRef.current) clearInterval(startTimerRef.current)
          startTimerRef.current = null
          console.warn(
            '[recorder] gave up after 10s — no remote audio track ever arrived; recording skipped',
          )
        }
      }, REMOTE_TRACK_POLL_MS)
    }

    return () => {
      cancelled = true
      if (startTimerRef.current) {
        clearInterval(startTimerRef.current)
        startTimerRef.current = null
      }
      stop(callId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, callId, rawCall])

  function stop(id: string | null) {
    if (stoppedRef.current) return
    stoppedRef.current = true

    const rec = recorderRef.current
    recorderRef.current = null

    // MediaRecorder.stop() fires a final `dataavailable` ASYNCHRONOUSLY
    // followed by `stop`. We need to:
    //   1) request the in-progress slice via requestData()
    //   2) wait for `stop` (= all pending dataavailable handlers have
    //      had a chance to run, including their fetch uploads)
    //   3) THEN tear down the audio graph and fire the finalize beacon
    //
    // The earlier code ripped the audio graph down immediately after
    // calling stop(), which canceled the final chunk's upload mid-flight
    // and produced incomplete recordings. Doing the cleanup inside the
    // 'stop' event guarantees the final chunk reaches the server.
    /** Wait until every in-flight chunk upload (including retries)
     *  has resolved, OR a hard timeout. Returns immediately if the
     *  counter is already 0. The hard timeout is a safety net so we
     *  never deadlock the cleanup on a stuck retry. */
    const waitForUploads = (timeoutMs: number) =>
      new Promise<void>((resolve) => {
        if (pendingUploadsRef.current === 0) {
          resolve()
          return
        }
        let done = false
        const finish = () => {
          if (done) return
          done = true
          pendingResolveRef.current = null
          resolve()
        }
        pendingResolveRef.current = finish
        setTimeout(finish, timeoutMs)
      })

    const finishCleanup = async () => {
      // Drain any chunk uploads still in retry-backoff. Without this,
      // the finalize beacon is sent with `total=N` while chunk N-1 is
      // still mid-retry, the server can't fetch it during stitch, and
      // the recording loses its last 5–10s. Hard cap is 8s so a
      // wedged retry doesn't block tab unload indefinitely.
      await waitForUploads(8000)

      // Tear down local mic + audio graph.
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null

      // Tell the server the chunks are done so it can stitch them.
      // Skip when we never recorded a chunk — finalize on 0 chunks
      // would just 404 the assemble path and confuse the logs.
      if (id && seqRef.current > 0) {
        const url = `/api/calls/${id}/recording-chunk?finalize=true&total=${seqRef.current}`
        try {
          // sendBeacon is keepalive-class (64 KB limit) but the body
          // here is a 1-byte placeholder — well under the limit. It
          // also survives page unload, which a normal fetch wouldn't.
          const blob = new Blob([''], { type: 'text/plain' })
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url, blob)
          } else {
            fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
          }
          console.log(
            `[recorder] finalize requested for ${id} (${seqRef.current} chunks)`,
          )
        } catch (err) {
          console.warn('[recorder] finalize beacon failed:', err)
        }
      } else if (id) {
        console.warn('[recorder] no chunks uploaded — skipping finalize')
      }
    }

    if (rec && rec.state !== 'inactive') {
      try {
        // Listen for the 'stop' event so cleanup runs AFTER the final
        // dataavailable handler has had a chance to upload.
        const onStop = () => {
          rec.removeEventListener('stop', onStop)
          // finishCleanup is async (drains pending uploads), so kick
          // it off in a microtask and let it complete on its own.
          void finishCleanup()
        }
        rec.addEventListener('stop', onStop)
        rec.requestData?.()
        rec.stop()
      } catch (err) {
        console.warn('[recorder] stop error:', err)
        void finishCleanup()
      }
    } else {
      void finishCleanup()
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
