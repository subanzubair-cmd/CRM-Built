'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, Users, DollarSign, MapPin, Upload } from 'lucide-react'
import { BuyerKanban, type BuyerMatchRow, type DispoStageItem } from './BuyerKanban'
import { ImportBuyersToDispoModal } from './ImportBuyersToDispoModal'

export interface DispoProperty {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  exitStrategy: string | null
  _count: {
    buyerMatches: number
  }
  offers: Array<{ buyerId: string }>
}

interface Props {
  properties: DispoProperty[]
  selectedPropertyId: string | null
  buyerMatches: BuyerMatchRow[]
  initialStages?: DispoStageItem[]
}

const EXIT_LABELS: Record<string, string> = {
  WHOLESALE_ASSIGNMENT:  'Wholesale Assignment',
  WHOLESALE_DOUBLE_CLOSE:'Wholesale Double Close',
  INSTALLMENT:           'Installment',
  SELLER_FINANCE:        'Seller Finance',
  FIX_AND_FLIP:          'Fix & Flip',
  JOINT_VENTURE:         'Joint Venture',
  NEW_CONSTRUCTION:      'New Construction',
  NOVATION:              'Novation',
  PARTNERSHIP:           'Partnership',
  PROJECT_MANAGEMENT:    'Project Management',
  RETAIL_LISTING:        'Retail Listing',
  SALE_LEASEBACK:        'Sale Leaseback',
  WHOLETAIL:             'Wholetail',
  RENTAL:                'Rental',
  TURNKEY:               'Turnkey',
}

export function DispoWorkspace({ properties, selectedPropertyId, buyerMatches, initialStages }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [showImport, setShowImport] = useState(false)

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null

  function selectProperty(id: string) {
    router.push(`${pathname}?propertyId=${id}`)
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 -mx-5 -mb-5">
      {/* ── Left Panel: Property List ── */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Dispo Properties</h2>
          <p className="text-xs text-gray-500">{properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <p className="text-sm text-gray-500">No dispo properties yet.</p>
              <p className="text-xs text-gray-400 mt-1">Set an exit strategy and move a lead to Under Contract to route it here.</p>
            </div>
          ) : (
            properties.map((prop) => {
              const isSelected = prop.id === selectedPropertyId
              return (
                <button
                  key={prop.id}
                  onClick={() => selectProperty(prop.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {prop.streetAddress ?? 'Address Unknown'}
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-0.5 mt-0.5">
                        <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                        {[prop.city, prop.state, prop.zip].filter(Boolean).join(', ') || 'Location unknown'}
                      </p>
                      {prop.exitStrategy && (
                        <span className="inline-block mt-1 text-[10px] bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
                          {EXIT_LABELS[prop.exitStrategy] ?? prop.exitStrategy}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/dispo/${prop.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 text-gray-300 hover:text-blue-500 transition-colors mt-0.5"
                      title="View full record"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Users className="w-3 h-3" />
                      {prop._count.buyerMatches} buyer{prop._count.buyerMatches !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-gray-500">
                      <DollarSign className="w-3 h-3" />
                      {prop.offers?.length ?? 0} offer{(prop.offers?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right Panel: Buyer Kanban ── */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {selectedProperty ? (
          <>
            {/* Kanban header */}
            <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {selectedProperty.streetAddress ?? 'Property'}
                </h2>
                <p className="text-xs text-gray-500">
                  {[selectedProperty.city, selectedProperty.state, selectedProperty.zip].filter(Boolean).join(', ')} · Buyer Pipeline
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV
                </button>
                <Link
                  href={`/dispo/${selectedProperty.id}`}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Full record
                </Link>
              </div>
            </div>

            {showImport && (
              <ImportBuyersToDispoModal
                propertyId={selectedProperty.id}
                stages={(initialStages ?? []).map((s) => ({ key: s.key, label: s.label }))}
                onClose={() => setShowImport(false)}
              />
            )}

            {/* Kanban board */}
            <div className="flex-1 overflow-auto p-4">
              <BuyerKanban propertyId={selectedProperty.id} initialMatches={buyerMatches} initialStages={initialStages} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-gray-200 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">Select a property</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Click a property in the list to view and manage its buyer pipeline.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
