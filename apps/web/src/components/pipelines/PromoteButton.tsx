'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

interface PromoteOption {
  toStatus: string
  label: string
  color: string
}

interface Props {
  propertyId: string
  options: PromoteOption[]
  onPromoted?: (toStatus: string) => void
}

export function PromoteButton({ propertyId, options, onPromoted }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null)

  async function promote(toStatus: string) {
    setError(null)
    setLoadingStatus(toStatus)
    try {
      const res = await fetch(`/api/properties/${propertyId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed')
        return
      }
      onPromoted?.(toStatus)
      startTransition(() => router.refresh())
    } finally {
      setLoadingStatus(null)
    }
  }

  const anyLoading = isPending || loadingStatus !== null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
        <ArrowRight className="w-4 h-4" />
        Move To
      </h3>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const isThisLoading = loadingStatus === opt.toStatus
          return (
            <button
              key={opt.toStatus}
              onClick={() => promote(opt.toStatus)}
              disabled={anyLoading}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 ${anyLoading && !isThisLoading ? 'cursor-not-allowed' : ''} ${opt.color}`}
            >
              {isThisLoading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : null}
              {isThisLoading ? 'Moving…' : opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
