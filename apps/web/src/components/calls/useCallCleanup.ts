'use client'

import { useEffect, useRef } from 'react'

/**
 * useCallCleanup — fire-and-forget hangup if the page unloads (refresh,
 * tab close, navigate away, network drop) while a call is active.
 *
 * Wires three browser signals:
 *   1. `pagehide`       — fires on tab close / nav away / refresh on Safari
 *   2. `beforeunload`   — fires on tab close / nav away / refresh on Chrome+Firefox
 *   3. `visibilitychange` (hidden + close-via-visibility) — handles edge cases
 *
 * Uses `navigator.sendBeacon()` (NOT fetch) because:
 *   - sendBeacon is the ONLY HTTP method browsers guarantee will complete
 *     during unload — fetch and XMLHttpRequest are routinely cancelled.
 *   - It includes session cookies automatically, so the hangup endpoint
 *     can authenticate as normal.
 *   - It returns synchronously and queues the request.
 *
 * The server-side /api/calls/[id]/hangup is idempotent — if the user
 * properly hangs up first AND the beacon also fires, the second call
 * returns 200 alreadyCompleted: true.
 *
 * Pass null when no call is active to disable the listeners cleanly.
 */
export function useCallCleanup(activeCallId: string | null): void {
  // Hold the latest ID in a ref so the listener (registered once) always
  // sees the current value without re-registering on every re-render.
  const idRef = useRef<string | null>(activeCallId)
  useEffect(() => {
    idRef.current = activeCallId
  }, [activeCallId])

  useEffect(() => {
    // Skip in non-browser contexts (SSR safety).
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return

    function fireHangupBeacon() {
      const id = idRef.current
      if (!id) return
      try {
        // Empty Blob with text/plain to avoid CORS preflight; the route
        // only needs the URL param to know which call to terminate.
        const blob = new Blob([''], { type: 'text/plain' })
        navigator.sendBeacon(`/api/calls/${id}/hangup`, blob)
      } catch {
        // Last-resort fetch with keepalive (Chrome/Edge support it on
        // unload too — Safari does not).
        try {
          fetch(`/api/calls/${id}/hangup`, { method: 'POST', keepalive: true }).catch(() => {})
        } catch {
          // Nothing else we can do — browser will tear down imminently.
        }
      }
    }

    function onPageHide() {
      fireHangupBeacon()
    }

    function onBeforeUnload() {
      fireHangupBeacon()
    }

    function onVisibilityChange() {
      // Some mobile browsers fire visibilitychange→hidden as the only
      // signal before being suspended. Only fire when the page is being
      // permanently hidden (not just backgrounded), which we can't tell
      // perfectly — but a redundant beacon is harmless thanks to the
      // server-side idempotency.
      if (document.visibilityState === 'hidden') {
        fireHangupBeacon()
      }
    }

    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}
