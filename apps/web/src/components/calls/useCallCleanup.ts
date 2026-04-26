'use client'

import { useEffect, useRef } from 'react'

/**
 * useCallCleanup — fire-and-forget hangup ONLY if the page is actually
 * unloading (refresh, tab close, hard navigation away, network drop).
 *
 * We deliberately listen to two events, NOT three:
 *   1. `pagehide`     — only fires on real document teardown (close/nav)
 *   2. `beforeunload` — only fires on real document teardown
 *
 * We do NOT listen for `visibilitychange → hidden` even though earlier
 * versions did. That event fires when the user switches browser tabs,
 * minimizes the window, or opens a target="_blank" link from the popup
 * (focus shifts to the new tab → original tab becomes hidden). All of
 * those are normal in-call interactions — agents look up the lead in
 * another tab, take notes in another window, etc. — and dropping the
 * call there is broken behavior.
 *
 * For pagehide: we additionally check `event.persisted` so hangup
 * doesn't fire when the page is being moved into the bfcache (modern
 * browsers preserve the page in memory; the call should keep running).
 *
 * sendBeacon is used over fetch because it's the only HTTP API browsers
 * guarantee to complete during unload. The /api/calls/[id]/hangup route
 * is idempotent so a redundant beacon after the user hangs up manually
 * is harmless.
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
        try {
          fetch(`/api/calls/${id}/hangup`, { method: 'POST', keepalive: true }).catch(() => {})
        } catch {
          // Browser tearing down imminently — nothing else we can do.
        }
      }
    }

    function onPageHide(e: PageTransitionEvent) {
      // bfcache: page is being preserved, NOT torn down. Skip hangup so
      // the call survives a back/forward navigation.
      if (e.persisted) return
      fireHangupBeacon()
    }

    function onBeforeUnload() {
      fireHangupBeacon()
    }

    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])
}
