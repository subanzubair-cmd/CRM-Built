'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Plus } from 'lucide-react'

interface CriteriaRow {
  id: string
  markets: string[]
  propertyTypes: string[]
  minBeds: number | null
  maxBeds: number | null
  minPrice: number | null
  maxPrice: number | null
  minArv: number | null
  maxArv: number | null
  maxRepairs: number | null
  notes: string | null
}

interface Props {
  buyerId: string
  criteria: CriteriaRow[]
}

export function BuyerCriteriaCard({ buyerId, criteria }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)

  async function deleteCriteria(criteriaId: string) {
    await fetch(`/api/buyers/${buyerId}/criteria`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteriaId }),
    })
    startTransition(() => router.refresh())
  }

  async function addCriteria(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body = {
      markets: (fd.get('markets') as string).split(',').map((s) => s.trim()).filter(Boolean),
      propertyTypes: (fd.get('propertyTypes') as string).split(',').map((s) => s.trim()).filter(Boolean),
      minPrice: fd.get('minPrice') ? parseFloat(fd.get('minPrice') as string) : undefined,
      maxPrice: fd.get('maxPrice') ? parseFloat(fd.get('maxPrice') as string) : undefined,
      minBeds: fd.get('minBeds') ? parseInt(fd.get('minBeds') as string) : undefined,
      maxBeds: fd.get('maxBeds') ? parseInt(fd.get('maxBeds') as string) : undefined,
      maxRepairs: fd.get('maxRepairs') ? parseFloat(fd.get('maxRepairs') as string) : undefined,
      notes: (fd.get('notes') as string) || undefined,
    }
    await fetch(`/api/buyers/${buyerId}/criteria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setShowForm(false)
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Buy Box Criteria</h3>
        <button onClick={() => setShowForm(!showForm)} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Criteria
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCriteria} className="mb-4 border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Markets (comma-separated)</label>
              <input name="markets" placeholder="Dallas, Fort Worth" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Property Types</label>
              <input name="propertyTypes" placeholder="SFR, MFR" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Min Price ($)</label>
              <input name="minPrice" type="number" placeholder="50000" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Price ($)</label>
              <input name="maxPrice" type="number" placeholder="300000" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Min Beds</label>
              <input name="minBeds" type="number" placeholder="2" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Repairs ($)</label>
              <input name="maxRepairs" type="number" placeholder="30000" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input name="notes" placeholder="Cash only, no MLS..." className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition-colors active:scale-95">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 transition-colors active:scale-95">Cancel</button>
          </div>
        </form>
      )}

      {criteria.length === 0 ? (
        <p className="text-sm text-gray-400">No buy box criteria yet</p>
      ) : (
        <div className="space-y-3">
          {criteria.map((c) => (
            <div key={c.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1 text-sm flex-1">
                  {c.markets.length > 0 && <p><span className="text-gray-500">Markets:</span> <span className="text-gray-800">{c.markets.join(', ')}</span></p>}
                  {c.propertyTypes.length > 0 && <p><span className="text-gray-500">Types:</span> <span className="text-gray-800">{c.propertyTypes.join(', ')}</span></p>}
                  {(c.minPrice || c.maxPrice) && (
                    <p><span className="text-gray-500">Price:</span> <span className="text-gray-800">{c.minPrice ? `$${Number(c.minPrice).toLocaleString()}` : '$0'} – {c.maxPrice ? `$${Number(c.maxPrice).toLocaleString()}` : 'any'}</span></p>
                  )}
                  {(c.minBeds || c.maxBeds) && <p><span className="text-gray-500">Beds:</span> <span className="text-gray-800">{c.minBeds ?? 'any'} – {c.maxBeds ?? 'any'}</span></p>}
                  {c.maxRepairs && <p><span className="text-gray-500">Max Repairs:</span> <span className="text-gray-800">${Number(c.maxRepairs).toLocaleString()}</span></p>}
                  {c.notes && <p className="text-gray-500 italic">{c.notes}</p>}
                </div>
                <button onClick={() => deleteCriteria(c.id)} disabled={isPending} className="text-gray-300 hover:text-red-500 ml-3 flex-shrink-0 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
