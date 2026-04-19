'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  propertyId: string
  onClose: () => void
  onSaved: () => void
}

export function OfferMadeModal({ propertyId, onClose, onSaved }: Props) {
  const [offerPrice, setOfferPrice] = useState('')
  const [offerType, setOfferType] = useState<'VERBAL' | 'WRITTEN'>('VERBAL')
  const [offerDate, setOfferDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    const price = parseFloat(offerPrice.replace(/[^0-9.]/g, ''))
    if (!price || price <= 0) {
      toast.error('Please enter a valid offer price')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeLeadStage: 'OFFER_MADE',
          offerPrice: price,
          offerType,
          offerDate,
        }),
      })
      if (!res.ok) throw new Error('Failed')

      // Also save as a LeadOffer record for the Manage Offers table
      await fetch(`/api/properties/${propertyId}/lead-offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerBy: 'OUR_OFFER',
          offerDate,
          offerType,
          offerPrice: price,
        }),
      }).catch(() => {}) // Best effort — don't block stage change

      toast.success('Offer saved')
      onSaved()
    } catch {
      toast.error('Failed to save offer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Teal header */}
        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-white text-lg font-bold tracking-wide uppercase">Lead Status - Offers Made</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Offers Made</p>

          <div className="grid grid-cols-2 gap-6 mb-5">
            {/* Offer Price */}
            <div>
              <label className="text-sm font-semibold text-gray-800">
                Your Offer Price <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center mt-1.5 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
                <span className="text-sm text-gray-400 mr-1">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={offerPrice.replace(/[^0-9.]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  onChange={(e) => setOfferPrice(e.target.value.replace(/,/g, ''))}
                  placeholder="0"
                  className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-300"
                  autoFocus
                />
              </div>
            </div>

            {/* Offer Type */}
            <div>
              <label className="text-sm font-semibold text-gray-800">
                Offer Type <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-4 mt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="offerType"
                    checked={offerType === 'VERBAL'}
                    onChange={() => setOfferType('VERBAL')}
                    className="w-4 h-4 text-blue-600 accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">Verbal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="offerType"
                    checked={offerType === 'WRITTEN'}
                    onChange={() => setOfferType('WRITTEN')}
                    className="w-4 h-4 text-blue-600 accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">Written</span>
                </label>
              </div>
            </div>
          </div>

          {/* Offer Date */}
          <div className="mb-6">
            <label className="text-sm font-semibold text-gray-800">Date of Your Offer</label>
            <input
              type="date"
              value={offerDate}
              onChange={(e) => setOfferDate(e.target.value)}
              className="w-full mt-1.5 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-4 pt-2 border-t border-gray-100">
            <button onClick={onClose} className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Update Status'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
