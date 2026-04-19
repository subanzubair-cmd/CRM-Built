'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, X, ExternalLink } from 'lucide-react'

interface Props {
  leadId: string
  existingId: string
  existingAddress: string
  pipeline: string
}

/**
 * Yellow warning banner shown at the top of the lead detail page when a
 * duplicate address was detected during creation. Dismissable and stored
 * in localStorage so it doesn't reappear after the user dismisses it.
 */
export function DuplicateWarningBanner({ leadId, existingId, existingAddress, pipeline }: Props) {
  const storageKey = `dup-dismissed-${leadId}`
  const [dismissed, setDismissed] = useState(true) // default hidden until checked

  useEffect(() => {
    const wasDismissed = localStorage.getItem(storageKey)
    setDismissed(wasDismissed === 'true')
  }, [storageKey])

  if (dismissed) return null

  function handleDismiss() {
    localStorage.setItem(storageKey, 'true')
    setDismissed(true)
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800">
          A similar lead exists: {existingAddress}
        </p>
        <p className="text-xs text-amber-600 mt-0.5">
          This lead may be a duplicate. Review the existing lead before proceeding.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={`/leads/${pipeline}/${existingId}`}
          className="inline-flex items-center gap-1 text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          View Existing
        </Link>
        <button
          onClick={handleDismiss}
          className="p-1 text-amber-500 hover:text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
