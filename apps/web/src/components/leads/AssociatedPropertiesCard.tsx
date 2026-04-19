// apps/web/src/components/leads/AssociatedPropertiesCard.tsx
import Link from 'next/link'
import { Users } from 'lucide-react'
import { getAssociatedProperties } from '@/lib/associated-properties'

interface Props {
  propertyId: string
}

export async function AssociatedPropertiesCard({ propertyId }: Props) {
  const associated = await getAssociatedProperties(propertyId)

  if (associated.length === 0) return null

  function detailHref(prop: { id: string; propertyStatus: string; leadStatus: string }): string {
    const s = prop.propertyStatus
    if (s === 'IN_TM') return `/tm/${prop.id}`
    if (s === 'IN_INVENTORY') return `/inventory/${prop.id}`
    if (s === 'IN_DISPO') return `/dispo/${prop.id}`
    if (s === 'SOLD') return `/sold/${prop.id}`
    if (s === 'RENTAL') return `/rental/${prop.id}`
    // Default: active lead
    if (prop.leadStatus === 'WARM') return `/leads/warm/${prop.id}`
    if (prop.leadStatus === 'DEAD') return `/leads/dead/${prop.id}`
    return `/leads/dts/${prop.id}`
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-3.5 h-3.5 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">
          Associated Properties
          <span className="ml-1 text-gray-400 font-normal">({associated.length})</span>
        </h3>
      </div>

      <div className="space-y-2">
        {associated.map((prop) => (
          <div key={prop.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={detailHref(prop)}
                className="text-sm font-medium text-blue-600 hover:underline truncate block"
              >
                {[prop.streetAddress, prop.city, prop.state, (prop as any).zip].filter(Boolean).join(', ') || 'Unknown address'}
              </Link>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Shared phone: {prop.matchedPhone}
              </p>
            </div>
            <span className="flex-shrink-0 text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {prop.propertyStatus?.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
