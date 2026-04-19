'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { DollarSign, Phone } from 'lucide-react'

interface BuyerOfferRow {
  id: string
  dispoOfferAmount: number | string
  status: string
  notes: string | null
  submittedAt: Date
  buyer: {
    contact: { firstName: string; lastName: string | null }
  }
}

interface BuyerMatchRow {
  id: string
  score: number
  buyer: {
    id: string
    contact: { firstName: string; lastName: string | null; phone: string | null; email: string | null }
  }
}

interface Props {
  propertyId: string
  buyerMatches: BuyerMatchRow[]
  offers: BuyerOfferRow[]
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-yellow-50 text-yellow-700',
  ACCEPTED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-50 text-red-700',
  COUNTERED: 'bg-blue-50 text-blue-700',
}

export function BuyerMatchCard({ propertyId, buyerMatches, offers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [selectedBuyerId, setSelectedBuyerId] = useState('')
  const [dispoOfferAmount, setOfferAmount] = useState('')
  const [rerunning, setRerunning] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [recordOfferLoading, setRecordOfferLoading] = useState(false)

  // Build lookup: buyerId → their current offer (most recent)
  const offerByBuyer = offers.reduce<Record<string, BuyerOfferRow>>((acc, o) => {
    const buyerId = (o as any).buyer?.id
    if (buyerId && !acc[buyerId]) acc[buyerId] = o
    return acc
  }, {})

  async function recordOffer() {
    if (!selectedBuyerId || !dispoOfferAmount) return
    setRecordOfferLoading(true)
    try {
      await fetch(`/api/properties/${propertyId}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: selectedBuyerId, dispoOfferAmount: parseFloat(dispoOfferAmount) }),
      })
      setShowOfferForm(false)
      setSelectedBuyerId('')
      setOfferAmount('')
      startTransition(() => router.refresh())
    } finally {
      setRecordOfferLoading(false)
    }
  }

  async function updateOfferStatus(offerId: string, status: string) {
    setActionLoading(offerId)
    try {
      await fetch(`/api/properties/${propertyId}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId, status }),
      })
      startTransition(() => router.refresh())
    } finally {
      setActionLoading(null)
    }
  }

  async function rerunMatching() {
    setRerunning(true)
    try {
      await fetch(`/api/properties/${propertyId}/match-buyers`, { method: 'POST' })
      startTransition(() => router.refresh())
    } finally {
      setRerunning(false)
    }
  }

  function openOfferFormForBuyer(buyerId: string) {
    setSelectedBuyerId(buyerId)
    setShowOfferForm(true)
  }

  return (
    <div className="space-y-4">
      {/* Offers */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4" />
            Offers <span className="text-gray-400 font-normal">({offers.length})</span>
          </h3>
          <button
            onClick={() => setShowOfferForm(!showOfferForm)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            + Record Offer
          </button>
        </div>

        {showOfferForm && (
          <div className="mb-3 border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Buyer</label>
              <select
                value={selectedBuyerId}
                onChange={(e) => setSelectedBuyerId(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select buyer...</option>
                {buyerMatches.map((m) => (
                  <option key={m.buyer.id} value={m.buyer.id}>
                    {m.buyer.contact.firstName} {m.buyer.contact.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Offer Amount ($)</label>
              <input
                type="number"
                value={dispoOfferAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder="150000"
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={recordOffer}
                disabled={isPending || recordOfferLoading || !selectedBuyerId || !dispoOfferAmount}
                className={`px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors active:scale-95 ${recordOfferLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {recordOfferLoading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                {recordOfferLoading ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowOfferForm(false)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {offers.length === 0 ? (
          <p className="text-sm text-gray-400">No offers yet</p>
        ) : (
          <div className="space-y-2">
            {offers.map((offer) => (
              <div key={offer.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    ${Number(offer.dispoOfferAmount).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {offer.buyer.contact.firstName} {offer.buyer.contact.lastName}
                    {' · '}{formatDistanceToNow(new Date(offer.submittedAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[offer.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {offer.status}
                  </span>
                  {offer.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => updateOfferStatus(offer.id, 'ACCEPTED')}
                        disabled={actionLoading !== null}
                        className={`text-[11px] text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1 disabled:opacity-50 transition-colors ${actionLoading !== null ? 'cursor-not-allowed' : ''}`}
                      >
                        {actionLoading === offer.id ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : null}
                        Accept
                      </button>
                      <button
                        onClick={() => updateOfferStatus(offer.id, 'REJECTED')}
                        disabled={actionLoading !== null}
                        className={`text-[11px] text-red-600 hover:text-red-800 font-medium flex items-center gap-1 disabled:opacity-50 transition-colors ${actionLoading !== null ? 'cursor-not-allowed' : ''}`}
                      >
                        {actionLoading === offer.id ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : null}
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buyer Matches */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <Phone className="w-4 h-4" />
            Buyer Matches <span className="text-gray-400 font-normal">({buyerMatches.length})</span>
          </h3>
          <button
            onClick={rerunMatching}
            disabled={rerunning || isPending}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 transition-colors"
          >
            {rerunning ? 'Running…' : '↻ Re-run Matching'}
          </button>
        </div>
        {buyerMatches.length === 0 ? (
          <p className="text-sm text-gray-400">No buyer matches found</p>
        ) : (
          <div className="space-y-2">
            {buyerMatches.map((match) => {
              const existingOffer = offerByBuyer[match.buyer.id]
              return (
                <div key={match.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {match.buyer.contact.firstName} {match.buyer.contact.lastName}
                    </p>
                    <p className="text-[11px] text-gray-400">{match.buyer.contact.phone ?? 'No phone'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {existingOffer ? (
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${STATUS_COLORS[existingOffer.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {existingOffer.status === 'ACCEPTED' ? `✓ $${Number(existingOffer.dispoOfferAmount).toLocaleString()}` : existingOffer.status}
                      </span>
                    ) : (
                      <button
                        onClick={() => openOfferFormForBuyer(match.buyer.id)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        + Offer
                      </button>
                    )}
                    <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {match.score}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
