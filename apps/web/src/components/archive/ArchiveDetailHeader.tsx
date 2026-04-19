'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Star } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  id: string
  type: 'sold' | 'rental'
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  isHot: boolean
  isFavorited: boolean
  source: string | null
  soldAt: Date | null
  createdAt: Date
}

export function ArchiveDetailHeader({
  id, type, streetAddress, city, state, zip,
  isHot, isFavorited, source, soldAt, createdAt,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function patch(data: Record<string, unknown>) {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">
              {streetAddress ?? 'Address Unknown'}
            </h1>
            <button onClick={() => patch({ isHot: !isHot })} title="Toggle hot">
              {isHot ? '🔥' : <Flame className="w-4 h-4 text-gray-300" />}
            </button>
            <button onClick={() => patch({ isFavorited: !isFavorited })} title="Toggle favorite">
              <Star className={`w-4 h-4 ${isFavorited ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {[city, state, zip].filter(Boolean).join(', ')}
            {source && <span className="ml-2 text-gray-400">· {source}</span>}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Added {format(new Date(createdAt), 'MMM d, yyyy')}
            {soldAt && type === 'sold' && (
              <> · Sold {format(new Date(soldAt), 'MMM d, yyyy')}</>
            )}
          </p>
        </div>

        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
          type === 'sold'
            ? 'bg-green-100 text-green-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {type === 'sold' ? 'SOLD' : 'RENTAL'}
        </span>
      </div>
    </div>
  )
}
