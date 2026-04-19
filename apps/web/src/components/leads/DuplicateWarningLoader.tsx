'use client'

import { useState, useEffect } from 'react'
import { DuplicateWarningBanner } from './DuplicateWarningBanner'

interface Props {
  leadId: string
  pipeline: string
}

/**
 * Reads duplicate warning info from localStorage (set during lead creation)
 * and renders DuplicateWarningBanner if a warning exists.
 */
export function DuplicateWarningLoader({ leadId, pipeline }: Props) {
  const [warning, setWarning] = useState<{
    existingId: string
    existingAddress: string
    existingStatus: string
  } | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dup-info-${leadId}`)
      if (raw) {
        setWarning(JSON.parse(raw))
      }
    } catch {
      // ignore parse errors
    }
  }, [leadId])

  if (!warning) return null

  return (
    <DuplicateWarningBanner
      leadId={leadId}
      existingId={warning.existingId}
      existingAddress={warning.existingAddress}
      pipeline={pipeline}
    />
  )
}
