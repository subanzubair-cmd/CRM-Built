import Link from 'next/link'

interface OverlapProperty {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  tags: string[]
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  propertyStatus: string
  stackScore: number
}

interface Props {
  properties: OverlapProperty[]
}

export function OverlapPanel({ properties }: Props) {
  if (properties.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-400">No overlapping addresses found yet.</p>
        <p className="text-xs text-gray-400 mt-1">Overlaps appear when the same address is imported from 2+ lists.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-amber-50">
        <p className="text-[13px] font-semibold text-amber-800">
          🔥 {properties.length} overlap{properties.length !== 1 ? 's' : ''} — addresses found in multiple lists
        </p>
        <p className="text-[11px] text-amber-600 mt-0.5">These are high-priority leads — target them first.</p>
      </div>
      <div className="divide-y divide-gray-50">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
          <span>Address</span>
          <span className="text-center">Stack Score</span>
          <span className="text-center">Status</span>
        </div>
        {properties.map((p) => {
          const href = p.leadType === 'DIRECT_TO_SELLER' ? `/leads/dts/${p.id}` : `/leads/dta/${p.id}`
          const scoreColor =
            p.stackScore >= 4 ? 'bg-red-100 text-red-700 border-red-200' :
            p.stackScore >= 3 ? 'bg-orange-100 text-orange-700 border-orange-200' :
            'bg-amber-50 text-amber-700 border-amber-200'
          return (
            <div key={p.id} className="grid grid-cols-[1fr_80px_80px] gap-2 items-center px-4 py-3 hover:bg-gray-50">
              <div className="min-w-0">
                <Link href={href} className="text-sm font-medium text-blue-600 hover:underline truncate block">
                  {p.streetAddress ?? 'No address'}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}
                </Link>
                <p className="text-[11px] text-gray-400">{p.zip}</p>
              </div>
              <div className="flex justify-center">
                <span className={`text-[12px] font-bold border rounded-full px-2.5 py-0.5 ${scoreColor}`}>
                  {p.stackScore}
                </span>
              </div>
              <div className="flex justify-center">
                <span className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 truncate">
                  {p.propertyStatus.replace('_', ' ')}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
