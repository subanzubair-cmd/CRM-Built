'use client'

/**
 * Side-effect module — installs a console.error filter to suppress
 * known-benign Telnyx WebRTC SDK noise (`telnyx_rtc.bye failed!` and
 * friends) from Next.js's dev-overlay error banner.
 *
 * MUST be imported BEFORE `@telnyx/webrtc`. The SDK's Logger captures
 * a reference to `console.error` at module initialization time, so a
 * patch installed later (e.g. inside getTelnyxClient()) is too late —
 * the SDK still holds the original. Imports in JS run in source
 * order, so importing this module first guarantees the patch is in
 * place when the SDK module evaluates.
 *
 * Suppressed events are still logged via `console.warn` so they're
 * visible in DevTools for debugging — they just don't trip the dev
 * overlay's red banner anymore.
 */

const SUPPRESSED_PATTERNS = [
  'telnyx_rtc.bye failed',
  'telnyx_rtc.modify failed',
  'telnyx_rtc.invite failed',
] as const

const FLAG = '__crmTelnyxConsolePatched__' as const

declare global {
  interface Console {
    [FLAG]?: boolean
  }
}

if (typeof window !== 'undefined' && typeof console !== 'undefined' && !console[FLAG]) {
  console[FLAG] = true
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    try {
      const flat = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ')
      if (SUPPRESSED_PATTERNS.some((p) => flat.includes(p))) {
        // Re-route to warn so the message is still visible for
        // debugging but doesn't trigger the dev-overlay error banner.
        console.warn('[telnyx suppressed]', ...args)
        return
      }
    } catch {
      /* if stringify throws, fall through to the original */
    }
    original(...args)
  }
}

export {} // make this a module (not an ambient script)
