'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

const EXIT_STRATEGIES = [
  { value: '', label: '— select exit type —', group: '' },
  // Route A — TM + Dispo
  { value: 'WHOLESALE_ASSIGNMENT', label: 'Wholesale Assignment', group: 'Route A — TM + Dispo' },
  { value: 'WHOLESALE_DOUBLE_CLOSE', label: 'Wholesale Double Close', group: 'Route A — TM + Dispo' },
  { value: 'INSTALLMENT', label: 'Installment', group: 'Route A — TM + Dispo' },
  { value: 'SELLER_FINANCE', label: 'Seller Finance', group: 'Route A — TM + Dispo' },
  // Route B — TM → Inventory
  { value: 'FIX_AND_FLIP', label: 'Fix & Flip', group: 'Route B — TM → Inventory' },
  { value: 'JOINT_VENTURE', label: 'Joint Venture', group: 'Route B — TM → Inventory' },
  { value: 'NEW_CONSTRUCTION', label: 'New Construction', group: 'Route B — TM → Inventory' },
  { value: 'NOVATION', label: 'Novation', group: 'Route B — TM → Inventory' },
  { value: 'PARTNERSHIP', label: 'Partnership', group: 'Route B — TM → Inventory' },
  { value: 'PROJECT_MANAGEMENT', label: 'Project Management', group: 'Route B — TM → Inventory' },
  { value: 'RETAIL_LISTING', label: 'Retail Listing', group: 'Route B — TM → Inventory' },
  { value: 'SALE_LEASEBACK', label: 'Sale Leaseback', group: 'Route B — TM → Inventory' },
  { value: 'WHOLETAIL', label: 'Wholetail', group: 'Route B — TM → Inventory' },
  // Route C — TM → Rental
  { value: 'RENTAL', label: 'Rental', group: 'Route C — TM → Rental' },
  { value: 'TURNKEY', label: 'Turnkey', group: 'Route C — TM → Rental' },
]

export interface UnderContractData {
  offerPrice: number | null
  offerType: 'VERBAL' | 'WRITTEN' | null
  offerDate: string | null          // ISO date string
  expectedProfit: number | null
  expectedProfitDate: string | null
  contractDate: string | null
  contractPrice: number | null
  scheduledClosingDate: string | null
  exitStrategy: string | null
  contingencies: string | null
}

interface Props {
  propertyId: string
  initialData: UnderContractData
  onSave: () => void
  onCancel: () => void
}

function toDateInput(val: string | null | undefined): string {
  if (!val) return ''
  try { return new Date(val).toISOString().slice(0, 10) } catch { return '' }
}

function toIso(val: string): string | null {
  if (!val) return null
  return new Date(val).toISOString()
}

export function UnderContractModal({ propertyId, initialData, onSave, onCancel }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [offerPrice, setOfferPrice] = useState(initialData.offerPrice?.toString() ?? '')
  const [offerType, setOfferType] = useState<'VERBAL' | 'WRITTEN' | ''>(initialData.offerType ?? '')
  const [offerDate, setOfferDate] = useState(toDateInput(initialData.offerDate))
  const [expectedProfit, setExpectedProfit] = useState(initialData.expectedProfit?.toString() ?? '')
  const [expectedProfitDate, setExpectedProfitDate] = useState(toDateInput(initialData.expectedProfitDate))
  const [contractDate, setContractDate] = useState(toDateInput(initialData.contractDate))
  const [contractPrice, setContractPrice] = useState(initialData.contractPrice?.toString() ?? '')
  const [scheduledClosingDate, setScheduledClosingDate] = useState(toDateInput(initialData.scheduledClosingDate))
  const [exitStrategy, setExitStrategy] = useState(initialData.exitStrategy ?? '')
  const [contingencies, setContingencies] = useState(initialData.contingencies ?? '')

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeLeadStage: 'UNDER_CONTRACT',
          offerPrice: offerPrice ? parseFloat(offerPrice) : null,
          offerType: offerType || null,
          offerDate: toIso(offerDate),
          expectedProfit: expectedProfit ? parseFloat(expectedProfit) : null,
          expectedProfitDate: toIso(expectedProfitDate),
          contractDate: toIso(contractDate),
          contractPrice: contractPrice ? parseFloat(contractPrice) : null,
          scheduledClosingDate: toIso(scheduledClosingDate),
          exitStrategy: exitStrategy || null,
          contingencies: contingencies || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ? JSON.stringify(body.error) : 'Save failed')
      }
      onSave()
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  // Group exit strategies for optgroup display
  const groups = ['Route A — TM + Dispo', 'Route B — TM → Inventory', 'Route C — TM → Rental']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Under Contract</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fill in the contract details to move this lead to Under Contract.</p>
          </div>
          <button onClick={onCancel} disabled={saving} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── Offer Details ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Offer Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Offer Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={offerPrice.replace(/[^0-9.]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    onChange={(e) => setOfferPrice(e.target.value.replace(/,/g, ''))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Offer Date</label>
                <input
                  type="date"
                  value={offerDate}
                  onChange={(e) => setOfferDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-2">Offer Type</label>
              <div className="flex gap-4">
                {(['VERBAL', 'WRITTEN'] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input
                      type="radio"
                      name="offerType"
                      value={v}
                      checked={offerType === v}
                      onChange={() => setOfferType(v)}
                      className="accent-blue-600"
                    />
                    {v.charAt(0) + v.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* ── Under Contract Details ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Under Contract Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Under Contract Date</label>
                <input
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Under Contract Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={contractPrice.replace(/[^0-9.]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    onChange={(e) => setContractPrice(e.target.value.replace(/,/g, ''))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Expected Profit</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={expectedProfit.replace(/[^0-9.]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    onChange={(e) => setExpectedProfit(e.target.value.replace(/,/g, ''))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Expected Profit Date</label>
                <input
                  type="date"
                  value={expectedProfitDate}
                  onChange={(e) => setExpectedProfitDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Scheduled Closing Date</label>
                <input
                  type="date"
                  value={scheduledClosingDate}
                  onChange={(e) => setScheduledClosingDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* ── Exit Strategy ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Exit Strategy</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Exit Type</label>
                <select
                  value={exitStrategy}
                  onChange={(e) => setExitStrategy(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— select exit type —</option>
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {EXIT_STRATEGIES.filter((s) => s.group === g).map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Contingencies</label>
                <textarea
                  value={contingencies}
                  onChange={(e) => setContingencies(e.target.value)}
                  rows={3}
                  placeholder="Inspection contingency, financing contingency, etc."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save &amp; Move to Under Contract
          </button>
        </div>
      </div>
    </div>
  )
}
