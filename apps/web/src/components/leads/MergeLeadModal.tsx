'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Search, GitMerge, AlertTriangle } from 'lucide-react'

interface SearchResult {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  activeLeadStage: string | null
  contactName: string | null
}

interface Props {
  propertyId: string
  onClose: () => void
}

export function MergeLeadModal({ propertyId, onClose }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(q: string) {
    setQuery(q)
    setSelected(null)
    setError(null)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&type=leads&limit=10`)
      if (res.ok) {
        const data = await res.json()
        const items: SearchResult[] = (data.data ?? data ?? [])
          .filter((r: any) => r.id !== propertyId)
          .map((r: any) => ({
            id: r.id,
            streetAddress: r.streetAddress ?? null,
            city: r.city ?? null,
            state: r.state ?? null,
            activeLeadStage: r.activeLeadStage ?? null,
            contactName: r.contactName ?? r.contacts?.[0]?.contact?.firstName ?? null,
          }))
        setResults(items)
      }
    } catch {
      // ignore search errors
    } finally {
      setSearching(false)
    }
  }

  async function handleMerge() {
    if (!selected) return
    setMerging(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${propertyId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: selected.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to merge leads')
        return
      }
      startTransition(() => router.refresh())
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setMerging(false)
    }
  }

  const formatAddress = (r: SearchResult) =>
    [r.streetAddress, r.city, r.state, (r as any).zip].filter(Boolean).join(', ') || 'Address Unknown'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Merge Lead</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!selected ? (
            <>
              <p className="text-sm text-gray-600">
                Search for the duplicate lead you want to merge into this one. All contacts, notes, tasks, and communications from the duplicate will be transferred here.
              </p>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search by address or contact name..."
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Results */}
              {results.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900">{formatAddress(r)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {r.contactName && (
                          <span className="text-xs text-gray-500">{r.contactName}</span>
                        )}
                        {r.activeLeadStage && (
                          <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                            {r.activeLeadStage.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {query.trim().length >= 2 && !searching && results.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No matching leads found.</p>
              )}
            </>
          ) : (
            /* Confirmation view */
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Merge &quot;{formatAddress(selected)}&quot; into this lead?
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    All contacts, notes, tasks, and communications will be transferred. The duplicate will be marked as Dead. This action cannot be undone.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelected(null)}
                className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                &larr; Choose a different lead
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {selected && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {merging ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Merging...
                </>
              ) : (
                <>
                  <GitMerge className="w-4 h-4" />
                  Merge Lead
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
