'use client'

/**
 * AutoFillButton
 *
 * Calls POST /api/properties/[id]/lookup to fetch enriched property data,
 * shows the results in a confirmation dialog, then calls PATCH /api/leads/[id]
 * to persist the accepted values.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Wand2, X } from 'lucide-react'

interface Props {
  propertyId: string
}

interface LookupData {
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  yearBuilt?: number
  lotSize?: number
  propertyType?: string
  arv?: number
}

const FIELD_LABELS: Record<keyof LookupData, string> = {
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  sqft: 'Sq Ft',
  yearBuilt: 'Year Built',
  lotSize: 'Lot Size (sq ft)',
  propertyType: 'Property Type',
  arv: 'ARV ($)',
}

export function AutoFillButton({ propertyId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<LookupData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function handleFetch() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/lookup`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Lookup failed')
      setData(json.data as LookupData)
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!data) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      if (data.bedrooms != null) body.bedrooms = data.bedrooms
      if (data.bathrooms != null) body.bathrooms = data.bathrooms
      if (data.sqft != null) body.sqft = data.sqft
      if (data.yearBuilt != null) body.yearBuilt = data.yearBuilt
      if (data.lotSize != null) body.lotSize = data.lotSize
      if (data.propertyType) body.propertyType = data.propertyType
      if (data.arv != null) body.arv = data.arv

      const res = await fetch(`/api/leads/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Save failed')
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={handleFetch}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
      >
        {loading
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Wand2 className="w-3 h-3" />}
        Auto-Fill
      </button>

      {error && !open && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !saving && setOpen(false)}
          />
          {/* Panel */}
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">Auto-Fill Property Details</h2>
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              Confirm to apply these values from the property data provider.
            </p>

            {data && (
              <dl className="space-y-1.5 text-sm border rounded-lg p-3 bg-gray-50 mb-3">
                {(Object.entries(data) as [keyof LookupData, unknown][])
                  .filter(([, v]) => v != null)
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <dt className="text-gray-500">{FIELD_LABELS[key]}</dt>
                      <dd className="font-medium text-gray-900">{String(value)}</dd>
                    </div>
                  ))}
              </dl>
            )}

            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
