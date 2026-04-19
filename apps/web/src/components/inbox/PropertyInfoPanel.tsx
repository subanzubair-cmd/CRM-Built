import Link from 'next/link'
import { ExternalLink, User, MapPin } from 'lucide-react'

interface PropertyInfo {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  propertyStatus: string
  leadType: string | null
  tmStage: string | null
  inventoryStage: string | null
  assignedTo: { name: string | null } | null
}

function getDetailUrl(p: PropertyInfo): string {
  switch (p.propertyStatus) {
    case 'IN_TM':
      return `/tm/${p.id}`
    case 'IN_INVENTORY':
      return `/inventory/${p.id}`
    case 'IN_DISPO':
      return `/dispo/${p.id}`
    case 'SOLD':
      return `/sold/${p.id}`
    case 'RENTAL':
      return `/rental/${p.id}`
    default:
      return `/leads/${p.leadType === 'DIRECT_TO_AGENT' ? 'dta' : 'dts'}/${p.id}`
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ')
}

interface Props {
  property: PropertyInfo
}

export function PropertyInfoPanel({ property }: Props) {
  const detailUrl = getDetailUrl(property)
  const addressParts = [property.city, property.state, property.zip].filter(Boolean).join(', ')

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 leading-snug">
          {property.streetAddress ?? 'Unknown Property'}
        </h3>
        {addressParts && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {addressParts}
          </p>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Stage</span>
          <span className="text-xs font-medium text-gray-800 bg-gray-100 px-2 py-0.5 rounded capitalize">
            {formatStatus(property.propertyStatus)}
          </span>
        </div>

        {property.tmStage && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">TM Stage</span>
            <span className="text-xs font-medium text-gray-700 capitalize">
              {formatStatus(property.tmStage)}
            </span>
          </div>
        )}

        {property.inventoryStage && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Inv. Stage</span>
            <span className="text-xs font-medium text-gray-700 capitalize">
              {formatStatus(property.inventoryStage)}
            </span>
          </div>
        )}

        {property.assignedTo?.name && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <User className="w-3 h-3" />
              Assigned
            </span>
            <span className="text-xs font-medium text-gray-800">{property.assignedTo.name}</span>
          </div>
        )}
      </div>

      <Link
        href={detailUrl}
        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        View Full Record
      </Link>
    </div>
  )
}
