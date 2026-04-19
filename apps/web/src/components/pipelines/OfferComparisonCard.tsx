'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { DollarSign, CheckCircle, XCircle, Clock } from 'lucide-react'

interface OfferRow {
  id: string
  dispoOfferAmount: number | string
  status: string
  notes: string | null
  submittedAt: Date
  buyer: {
    id: string
    contact: { firstName: string; lastName: string | null }
  }
}

interface Props {
  propertyId: string
  offers: OfferRow[]
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  PENDING:   { label: 'Pending',   className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: <Clock className="w-3 h-3" /> },
  ACCEPTED:  { label: 'Accepted',  className: 'bg-green-50 text-green-700 border-green-200',  icon: <CheckCircle className="w-3 h-3" /> },
  REJECTED:  { label: 'Rejected',  className: 'bg-red-50 text-red-600 border-red-200',         icon: <XCircle className="w-3 h-3" /> },
  COUNTERED: { label: 'Countered', className: 'bg-blue-50 text-blue-700 border-blue-200',     icon: <DollarSign className="w-3 h-3" /> },
}

export function OfferComparisonCard({ propertyId, offers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actionOfferId, setActionOfferId] = useState<string | null>(null)

  async function updateStatus(offerId: string, status: 'ACCEPTED' | 'REJECTED') {
    setActionOfferId(offerId)
    try {
      await fetch(`/api/properties/${propertyId}/offers/${offerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      startTransition(() => router.refresh())
    } finally {
      setActionOfferId(null)
    }
  }

  if (offers.length === 0) return null

  // Sort by dispoOfferAmount descending for comparison
  const sorted = [...offers].sort((a, b) => Number(b.dispoOfferAmount) - Number(a.dispoOfferAmount))
  const hasAccepted = offers.some((o) => o.status === 'ACCEPTED')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
        <DollarSign className="w-4 h-4" />
        Offer Comparison
        <span className="text-gray-400 font-normal">({offers.length})</span>
      </h3>

      <div className="space-y-2">
        {sorted.map((offer, idx) => {
          const config = STATUS_CONFIG[offer.status] ?? STATUS_CONFIG.PENDING
          const isHighest = idx === 0
          const isLoading = actionOfferId === offer.id && isPending

          return (
            <div
              key={offer.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                offer.status === 'ACCEPTED'
                  ? 'border-green-200 bg-green-50/50'
                  : isHighest && offer.status !== 'REJECTED'
                  ? 'border-blue-200 bg-blue-50/30'
                  : 'border-gray-100'
              }`}
            >
              {/* Rank */}
              <span className="text-xs font-bold text-gray-400 w-4 flex-shrink-0">#{idx + 1}</span>

              {/* Buyer + Amount */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-gray-900">
                    ${Number(offer.dispoOfferAmount).toLocaleString()}
                  </span>
                  {isHighest && offer.status !== 'REJECTED' && (
                    <span className="text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                      Highest
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {offer.buyer.contact.firstName} {offer.buyer.contact.lastName}
                  {' · '}{formatDistanceToNow(new Date(offer.submittedAt), { addSuffix: true })}
                </p>
                {offer.notes && (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{offer.notes}</p>
                )}
              </div>

              {/* Status badge */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.className}`}>
                {config.icon}
                {config.label}
              </span>

              {/* Actions */}
              {offer.status === 'PENDING' && !hasAccepted && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => updateStatus(offer.id, 'ACCEPTED')}
                    disabled={isLoading}
                    className="px-2 py-1 text-[11px] font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? '…' : 'Accept'}
                  </button>
                  <button
                    onClick={() => updateStatus(offer.id, 'REJECTED')}
                    disabled={isLoading}
                    className="px-2 py-1 text-[11px] font-medium bg-white text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
