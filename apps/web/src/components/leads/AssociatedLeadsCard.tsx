'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Link2, ExternalLink } from 'lucide-react'

interface AssocProperty {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  propertyStatus: string
  leadType: string | null
  activeLeadStage: string | null
  contacts: Array<{ contact: { firstName: string; lastName: string | null; phone: string | null } }>
}

function getDetailUrl(p: AssocProperty): string {
  switch (p.propertyStatus) {
    case 'IN_TM': return `/tm/${p.id}`
    case 'IN_INVENTORY': return `/inventory/${p.id}`
    case 'IN_DISPO': return `/dispo/${p.id}`
    case 'SOLD': return `/sold/${p.id}`
    case 'RENTAL': return `/rental/${p.id}`
    default: return `/leads/${p.leadType === 'DIRECT_TO_AGENT' ? 'dta' : 'dts'}/${p.id}`
  }
}

interface Props {
  propertyId: string
}

export function AssociatedLeadsCard({ propertyId }: Props) {
  const [items, setItems] = useState<AssocProperty[] | null>(null)

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/associated`)
      .then((r) => r.json())
      .then((d) => setItems(d.associated ?? []))
      .catch(() => setItems([]))
  }, [propertyId])

  if (items === null) return null
  if (items.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mt-4">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Link2 className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">Associated Properties</h3>
        <span className="ml-auto text-xs text-gray-400">Same phone number</span>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map((p) => {
          const primary = p.contacts[0]?.contact
          return (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {p.streetAddress ?? 'Unknown Address'}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {[p.city, p.state, (p as any).zip].filter(Boolean).join(', ')}
                  {primary && ` · ${[primary.firstName, primary.lastName].filter(Boolean).join(' ')}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 capitalize">
                  {p.propertyStatus.replace(/_/g, ' ').toLowerCase()}
                </span>
                <Link
                  href={getDetailUrl(p)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  title="View record"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
