'use client'

/**
 * useIncomingCallRingtone — synthesize a US-style "ring-ring" tone via
 * Web Audio API while an inbound call popup is showing.
 *
 * Why synthesize instead of bundling an audio file?
 *  - No asset to ship (zero bytes added to the bundle)
 *  - No autoplay-blocked-audio surprises after the user clicks Answer/
 *    Reject (some browsers reject <audio src=""> autoplay until the
 *    user gestures; an AudioContext started inside a user gesture path
 *    is more reliable)
 *  - Easy to extend later (volume, alt patterns, accessibility silence)
 *
 * The classic US ring cadence is 2s ON / 4s OFF using 440 Hz + 480 Hz
 * mixed at low gain. We schedule one full ON burst, then schedule the
 * NEXT one on a setTimeout so we can cleanly stop mid-cycle.
 */

import { useEffect, useRef } from 'react'

const RING_ON_MS = 2000
const RING_OFF_MS = 4000
const RING_FREQS = [440, 480] // US "ring" pair
const RING_GAIN = 0.18 // 0..1 — keep it gentle so it doesn't startle

interface UseIncomingCallRingtoneOpts {
  /** True while the popup is visible AND the call is still RINGING. */
  active: boolean
  /** Optional override; defaults to true. Disable for users who mute. */
  enabled?: boolean
}

export function useIncomingCallRingtone({ active, enabled = true }: UseIncomingCallRingtoneOpts): void {
  const ctxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stoppedRef = useRef<boolean>(true)

  useEffect(() => {
    if (!active || !enabled) {
      stop()
      return
    }
    start()
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, enabled])

  function ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (ctxRef.current && ctxRef.current.state !== 'closed') return ctxRef.current
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined
      if (!Ctx) return null
      ctxRef.current = new Ctx()
      return ctxRef.current
    } catch {
      return null
    }
  }

  function playOneRing() {
    const ctx = ensureContext()
    if (!ctx) return
    // Some browsers start the context suspended until a user gesture.
    // Trying to resume inside the popup-render flow is safe — the popup
    // is itself the result of a polling tick, but resume() is idempotent
    // and a no-op if already running.
    ctx.resume().catch(() => {})

    const now = ctx.currentTime
    const dur = RING_ON_MS / 1000
    const master = ctx.createGain()
    master.gain.setValueAtTime(0, now)
    master.gain.linearRampToValueAtTime(RING_GAIN, now + 0.05) // soft attack
    master.gain.setValueAtTime(RING_GAIN, now + dur - 0.05)
    master.gain.linearRampToValueAtTime(0, now + dur) // soft release
    master.connect(ctx.destination)

    const oscs: OscillatorNode[] = []
    for (const f of RING_FREQS) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f, now)
      o.connect(master)
      o.start(now)
      o.stop(now + dur + 0.02)
      oscs.push(o)
    }
    // Disconnect after the burst to free audio nodes promptly.
    oscs[oscs.length - 1].onended = () => {
      try {
        master.disconnect()
        oscs.forEach((o) => o.disconnect())
      } catch {
        /* ignore */
      }
    }
  }

  function start() {
    stoppedRef.current = false
    // Fire one immediately, then schedule the cadence.
    const tick = () => {
      if (stoppedRef.current) return
      playOneRing()
      timerRef.current = setTimeout(tick, RING_ON_MS + RING_OFF_MS)
    }
    tick()
  }

  function stop() {
    stoppedRef.current = true
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // Don't close the AudioContext — closing/recreating on every call
    // is expensive and some browsers cap how many contexts a page may
    // create. Leave it for the next ring.
  }
}
