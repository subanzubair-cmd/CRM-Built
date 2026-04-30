'use client'

/**
 * Buyer / Vendor / Lead filter bar — sits above the contacts table.
 *
 * Renders:
 *   - Saved filter chips (pulled from /api/saved-filters?pipeline=...)
 *   - "Quick Filter" trigger that opens the side panel
 *   - "Manage Filter" trigger that opens the manage modal
 *   - Active-filter pill row showing each enabled parameter with an
 *     X to clear it inline
 *
 * Wires both BuyerQuickFilter + ManageFiltersModal for a single point
 * of integration with the contacts table.
 */

import { useEffect, useState } from 'react'
import { Filter, FolderOpen, X } from 'lucide-react'
import { BuyerQuickFilter, type QuickFilterState } from './BuyerQuickFilter'
import { ManageFiltersModal } from './ManageFiltersModal'

interface SavedFilter {
  id: string
  name: string
  filters: QuickFilterState
  folderId: string | null
}

interface Props {
  pipeline?: string
  /** Current active filter being applied to the table. */
  filter: QuickFilterState
  onChange: (next: QuickFilterState) => void
}

export function BuyerFilterBar({ pipeline = 'buyers', filter, onChange }: Props) {
  const [quickOpen, setQuickOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [saved, setSaved] = useState<SavedFilter[]>([])

  async function refreshSaved() {
    try {
      const r = await fetch(`/api/saved-filters?pipeline=${pipeline}`)
      const j = await r.json()
      setSaved(Array.isArray(j?.data) ? j.data : [])
    } catch {}
  }

  useEffect(() => {
    refreshSaved()
  }, [pipeline])

  function clearParam(id: string) {
    const enabled = filter.enabled.filter((x) => x !== id)
    const values = { ...filter.values }
    delete values[id]
    onChange({ enabled, values })
  }

  function clearAll() {
    onChange({ enabled: [], values: {} })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-lg"
        >
          <Filter className="w-3.5 h-3.5" />
          Quick Filter
        </button>
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Manage Filter
        </button>

        {/* Saved-filter quick-apply chips */}
        {saved.slice(0, 6).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.filters ?? { enabled: [], values: {} })}
            className="text-[12px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-full px-3 py-1"
            title={`Apply saved filter "${s.name}"`}
          >
            {s.name}
          </button>
        ))}

        {filter.enabled.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-[12px] text-gray-500 hover:text-red-600 font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filter pills */}
      {filter.enabled.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-2 border-t border-gray-100">
          <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">
            Active:
          </span>
          {filter.enabled.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-full px-2 py-0.5"
            >
              {readableLabel(id)}
              <button
                type="button"
                onClick={() => clearParam(id)}
                className="text-blue-400 hover:text-blue-700"
                aria-label={`Remove ${id}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <BuyerQuickFilter
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        pipeline={pipeline}
        onApply={(next) => {
          onChange(next)
          // Refresh saved list in case the user just saved a new one.
          refreshSaved()
        }}
        initial={filter}
      />
      <ManageFiltersModal
        open={manageOpen}
        onClose={() => {
          setManageOpen(false)
          refreshSaved()
        }}
        pipeline={pipeline}
        onApply={(f) => {
          // SavedFilter.filters is JSONB on the row — at runtime we
          // know the QuickFilter UI authored it, so we trust the shape.
          // Safe-extract here so a malformed legacy row doesn't crash.
          const raw = f.filters as unknown as { enabled?: string[]; values?: Record<string, any> } | null
          onChange({
            enabled: Array.isArray(raw?.enabled) ? raw.enabled : [],
            values: raw?.values ?? {},
          })
          setManageOpen(false)
        }}
      />
    </div>
  )
}

function readableLabel(id: string): string {
  // Mirror of the PARAMS catalogue in BuyerQuickFilter — small enough
  // that duplicating the labels is cheaper than threading the
  // catalogue through both files.
  const map: Record<string, string> = {
    name: 'Name',
    emailAddress: 'Email',
    phoneNumber: 'Phone',
    phoneNumberType: 'Phone Type',
    vipBuyer: 'VIP',
    contactType: 'Contact Type',
    howHeardAbout: 'How Heard',
    targetCities: 'Cities',
    targetStates: 'States',
    targetZips: 'Zips',
    targetCounties: 'County',
    tags: 'Tags',
    emailCampaign: 'Email Campaign',
    emailStats: 'Email Stats',
    smsCampaign: 'SMS Campaign',
    smsStats: 'SMS Stats',
    buyerCustomQuestions: 'Custom Q',
    whoOwnsThisBuyer: 'Owner',
    dateAdded: 'Date Added',
    numberOfDeals: 'Deals',
    numberOfInquiries: 'Inquiries',
    numberOfOffers: 'Offers',
    numberOfOpenHousesAttended: 'Open Houses',
    lastOutgoingTouch: 'Last Outgoing',
    lastIncomingTouch: 'Last Incoming',
    leadSource: 'Lead Source',
  }
  return map[id] ?? id
}
