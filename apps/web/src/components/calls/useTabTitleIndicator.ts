'use client'

import { useEffect } from 'react'

/**
 * useTabTitleIndicator — prefix the browser tab title with an emoji
 * while a call is ringing or in progress, so the user can identify
 * which tab has the call when they have many CRM tabs open.
 *
 * Phases:
 *   'ringing' → "📞 Incoming · <original title>"
 *   'active'  → "🟢 On Call · <original title>"
 *   null      → restores the original title
 *
 * Restores the title on unmount so we don't leave a stale prefix
 * after a hot-reload or component remount.
 */
type Phase = 'ringing' | 'active' | null

export function useTabTitleIndicator(phase: Phase): void {
  useEffect(() => {
    if (typeof document === 'undefined') return

    // Capture the title sans any prior emoji prefix so we don't
    // double-stack on rapid phase changes.
    const stripped = document.title.replace(/^(📞 Incoming · |🟢 On Call · )/, '')

    if (phase === 'ringing') {
      document.title = `📞 Incoming · ${stripped}`
    } else if (phase === 'active') {
      document.title = `🟢 On Call · ${stripped}`
    } else {
      document.title = stripped
    }

    return () => {
      // On unmount restore the bare title so the tab doesn't keep an
      // orphaned indicator if the popup tears down without going
      // through the phase=null path.
      document.title = document.title.replace(/^(📞 Incoming · |🟢 On Call · )/, '')
    }
  }, [phase])
}
