'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatPhone } from '@/lib/phone'

interface BuyerInfo {
  id: string
  buyerId: string
  name: string
  phone: string | null
  email: string | null
  dispoOfferAmount?: number
}

interface BuyerSearchResult {
  id: string
  contact: { firstName: string; lastName: string | null; phone: string | null; email: string | null }
}

interface Props {
  propertyId: string
  onConfirm: (data: { soldPrice: number; buyers: BuyerInfo[] }) => void
  onCancel: () => void
}

function fmtCommas(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0]
}

export function SoldDetailsModal({ propertyId, onConfirm, onCancel }: Props) {
  const [soldPrice, setSoldPrice] = useState('')
  const [buyers, setBuyers] = useState<BuyerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [buyerSearch, setBuyerSearch] = useState('')
  const [searchResults, setSearchResults] = useState<BuyerSearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [searching, setSearching] = useState(false)
  const [showAddBuyer, setShowAddBuyer] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Auto-fetch buyers from dispo pipeline (SOLD or DISPO_OFFER_RECEIVED stage)
  useEffect(() => {
    fetch(`/api/properties/${propertyId}/buyer-matches`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => {
        const matches = d.data ?? []
        // Get buyers in SOLD stage first, then DISPO_OFFER_RECEIVED as fallback
        const soldBuyers = matches.filter((m: any) => m.dispoStage === 'SOLD')
        const offerBuyers = matches.filter((m: any) => m.dispoStage === 'DISPO_OFFER_RECEIVED')
        const relevantBuyers = soldBuyers.length > 0 ? soldBuyers : offerBuyers

        if (relevantBuyers.length > 0) {
          setBuyers(relevantBuyers.map((m: any) => ({
            id: m.id,
            buyerId: m.buyerId ?? m.buyer?.id,
            name: [m.buyer?.contact?.firstName, m.buyer?.contact?.lastName].filter(Boolean).join(' '),
            phone: m.buyer?.contact?.phone ?? null,
            email: m.buyer?.contact?.email ?? null,
          })))
        }

        // Auto-fill sold price from dispo SOLD stage buyer's offer amount
        const soldBuyerWithOffer = relevantBuyers.find((m: any) => m.dispoOfferAmount != null && Number(m.dispoOfferAmount) > 0)
        if (soldBuyerWithOffer) {
          setSoldPrice(String(Number(soldBuyerWithOffer.dispoOfferAmount)))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [propertyId])

  // Buyer search
  useEffect(() => {
    if (buyerSearch.length < 2) { setSearchResults([]); setShowResults(false); return }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/buyers?search=${encodeURIComponent(buyerSearch)}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(Array.isArray(data?.data) ? data.data.slice(0, 8) : [])
          setShowResults(true)
        }
      } catch {}
      finally { setSearching(false) }
    }, 300)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [buyerSearch])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function addBuyer(buyer: BuyerSearchResult) {
    if (buyers.some(b => b.buyerId === buyer.id)) {
      toast.error('This buyer is already added')
      return
    }
    setBuyers(prev => [...prev, {
      id: '',
      buyerId: buyer.id,
      name: [buyer.contact.firstName, buyer.contact.lastName].filter(Boolean).join(' '),
      phone: buyer.contact.phone,
      email: buyer.contact.email,
    }])
    setBuyerSearch('')
    setShowResults(false)
    setShowAddBuyer(false)
  }

  function removeBuyer(index: number) {
    setBuyers(prev => prev.filter((_, i) => i !== index))
  }

  function handleSubmit() {
    const price = parseFloat(soldPrice.replace(/[^0-9.]/g, ''))
    if (!price || price <= 0) { toast.error('Enter a valid sold price'); return }
    onConfirm({ soldPrice: price, buyers })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-white text-lg font-bold">Sold Details</h2>
          <button onClick={onCancel} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading dispo data...</p>
          ) : (
            <>
              {/* Sold Price */}
              <div>
                <label className="text-sm font-semibold text-gray-800">Sold Price <span className="text-red-500">*</span></label>
                <div className="flex items-center mt-1.5 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:ring-1 focus-within:ring-blue-500">
                  <span className="text-sm text-gray-400 mr-1">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fmtCommas(soldPrice)}
                    onChange={(e) => setSoldPrice(e.target.value.replace(/,/g, ''))}
                    placeholder="0"
                    className="w-full text-sm outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {/* Buyers list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-800">Buyers ({buyers.length})</label>
                  <button onClick={() => setShowAddBuyer(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Plus className="w-3.5 h-3.5" /> Add Buyer
                  </button>
                </div>

                {buyers.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">No buyers selected. Add a buyer below.</p>
                ) : (
                  <div className="space-y-2">
                    {buyers.map((buyer, idx) => (
                      <div key={idx} className="flex items-center justify-between border border-green-200 bg-green-50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-green-800">{buyer.name}</p>
                          <p className="text-[11px] text-green-600">
                            {[formatPhone(buyer.phone), buyer.email].filter(Boolean).join(' | ')}
                          </p>
                        </div>
                        <button onClick={() => removeBuyer(idx)} className="p-1 text-green-600 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add buyer search */}
                {showAddBuyer && (
                  <div ref={dropdownRef} className="relative mt-2">
                    <div className="relative">
                      <input
                        value={buyerSearch}
                        onChange={(e) => setBuyerSearch(e.target.value)}
                        placeholder="Search buyer by name, phone, or email..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      {searching && <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 animate-pulse" />}
                    </div>
                    {showResults && searchResults.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {searchResults.map((buyer) => (
                          <button
                            key={buyer.id}
                            onClick={() => addBuyer(buyer)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                          >
                            <span className="text-sm font-medium">{buyer.contact.firstName} {buyer.contact.lastName ?? ''}</span>
                            {buyer.contact.email && <span className="text-xs text-gray-500 ml-1">{buyer.contact.email}</span>}
                            {buyer.contact.phone && <span className="text-xs text-gray-500 ml-1">{buyer.contact.phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setShowAddBuyer(false)} className="mt-1 text-xs text-gray-400 hover:text-gray-600">Cancel search</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onCancel} className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">Confirm Sale</button>
        </div>
      </div>
    </div>
  )
}
