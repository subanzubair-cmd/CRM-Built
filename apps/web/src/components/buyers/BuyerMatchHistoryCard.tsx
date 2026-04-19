'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

interface MatchRow {
  id: string
  score: number
  notified: boolean
  createdAt: Date
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    zip: string | null
    propertyStatus: string
    leadType: string
  }
}

interface Props {
  matches: MatchRow[]
}

export function BuyerMatchHistoryCard({ matches }: Props) {
  const router = useRouter()

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        Matched Properties <span className="text-gray-400 font-normal">({matches.length})</span>
      </h3>
      {matches.length === 0 ? (
        <p className="text-sm text-gray-400">No property matches yet</p>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => {
            const pipeline = match.property.leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'
            const status = match.property.propertyStatus
            const basePath = status === 'IN_TM' ? '/tm' : status === 'IN_INVENTORY' ? '/inventory' : status === 'IN_DISPO' ? '/dispo' : `/leads/${pipeline}`
            return (
              <div
                key={match.id}
                onClick={() => router.push(`${basePath}/${match.property.id}`)}
                className="flex items-center justify-between p-2 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {[match.property.streetAddress, match.property.city, [match.property.state, match.property.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Unknown'}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {match.property.propertyStatus.replace(/_/g, ' ')} · {formatDistanceToNow(new Date(match.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <span className="text-[11px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  Score: {match.score}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
