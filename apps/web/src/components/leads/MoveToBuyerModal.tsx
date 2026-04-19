'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Users, Check } from 'lucide-react'

interface ContactInfo {
  contact: {
    id: string
    firstName: string
    lastName: string | null
    phone: string | null
    email: string | null
  }
}

interface Props {
  propertyId: string
  contacts: ContactInfo[]
  onClose: () => void
}

export function MoveToBuyerModal({ propertyId, contacts, onClose }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    contacts.length === 1 ? contacts[0].contact.id : null,
  )
  const [markets, setMarkets] = useState('')
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConvert() {
    if (!selectedContactId) return
    setConverting(true)
    setError(null)
    try {
      const res = await fetch('/api/buyers/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContactId,
          propertyId,
          preferredMarkets: markets.trim()
            ? markets.split(',').map((m) => m.trim()).filter(Boolean)
            : [],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to convert to buyer')
        return
      }
      startTransition(() => router.refresh())
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Convert to Buyer</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {contacts.length === 0 ? (
            <p className="text-sm text-gray-500">No contacts on this lead to convert.</p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Contact</label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {contacts.map(({ contact: c }) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedContactId(c.id)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                        selectedContactId === c.id
                          ? 'bg-blue-50 border-blue-200'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {c.firstName} {c.lastName ?? ''}
                        </p>
                        <p className="text-xs text-gray-500">
                          {[c.phone, c.email].filter(Boolean).join(' | ') || 'No contact info'}
                        </p>
                      </div>
                      {selectedContactId === c.id && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Markets <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={markets}
                  onChange={(e) => setMarkets(e.target.value)}
                  placeholder="e.g. Atlanta, Dallas, Phoenix"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated list of markets</p>
              </div>
            </>
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
          <button
            onClick={handleConvert}
            disabled={!selectedContactId || converting || contacts.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {converting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Converting...
              </>
            ) : (
              'Convert to Buyer'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
