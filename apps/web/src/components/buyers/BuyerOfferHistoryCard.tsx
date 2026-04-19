'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

interface OfferRow {
  id: string
  dispoOfferAmount: unknown
  status: string
  notes: string | null
  submittedAt: Date
  respondedAt: Date | null
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    leadType: string
  }
}

interface Props {
  offers: OfferRow[]
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-yellow-50 text-yellow-700',
  ACCEPTED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-50 text-red-700',
  COUNTERED: 'bg-blue-50 text-blue-700',
}

export function BuyerOfferHistoryCard({ offers }: Props) {
  const router = useRouter()

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        Offer History <span className="text-gray-400 font-normal">({offers.length})</span>
      </h3>
      {offers.length === 0 ? (
        <p className="text-sm text-gray-400">No offers submitted yet</p>
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => {
            const pipeline = offer.property.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
            return (
              <div
                key={offer.id}
                onClick={() => router.push(`/leads/${pipeline}/${offer.property.id}`)}
                className="flex items-center justify-between p-2 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">${Number(offer.dispoOfferAmount).toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400">
                    {offer.property.streetAddress ?? 'Unknown'}{offer.property.city && `, ${offer.property.city}`}
                    {' · '}{format(new Date(offer.submittedAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[offer.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {offer.status}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
