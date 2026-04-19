'use client'

import { useState, useEffect } from 'react'
import { X, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Offer {
  id: string
  offerBy: string
  offerDate: string
  offerType: string
  offerPrice: number
  createdAt: string
  createdByName?: string | null
}

function fmtCommas(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0]
}

interface Props {
  propertyId: string
  propertyAddress: string
  contactName?: string
  onClose: () => void
}

export function ManageOffersModal({ propertyId, propertyAddress, contactName, onClose }: Props) {
  const router = useRouter()
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  // Add form state
  const [addOfferBy, setAddOfferBy] = useState('')
  const [addDate, setAddDate] = useState(new Date().toISOString().split('T')[0])
  const [addType, setAddType] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editType, setEditType] = useState('')
  const [editDate, setEditDate] = useState('')

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/lead-offers`)
      .then((r) => r.json())
      .then((d) => setOffers(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [propertyId])

  function getTimeElapsed(offerDate: string, index: number): string {
    if (index === 0) return 'N/A'
    const prev = new Date(offers[index - 1].offerDate)
    const curr = new Date(offerDate)
    const diffMs = curr.getTime() - prev.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Same Day'
    if (diffDays === 1) return '1 Day'
    return `${diffDays} Days`
  }

  function getDifference(index: number): string {
    if (index === 0) return 'N/A'
    const prev = offers[index - 1].offerPrice
    const curr = offers[index].offerPrice
    const diff = prev - curr
    if (diff === 0) return '$0'
    return `${diff > 0 ? '' : '-'}$${Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  }

  async function addOffer() {
    if (!addOfferBy || !addType || !addPrice) {
      toast.error('Please fill all fields')
      return
    }
    const price = parseFloat(addPrice.replace(/[^0-9.]/g, ''))
    if (!price || price <= 0) { toast.error('Invalid price'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/lead-offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerBy: addOfferBy, offerDate: addDate, offerType: addType, offerPrice: price }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setOffers((prev) => [...prev, data.data].sort((a, b) => new Date(a.offerDate).getTime() - new Date(b.offerDate).getTime()))
      setShowAdd(false)
      setAddOfferBy('')
      setAddDate(new Date().toISOString().split('T')[0])
      setAddType('')
      setAddPrice('')
      toast.success('Offer added')
      router.refresh()
    } catch { toast.error('Failed to add offer') }
    finally { setSaving(false) }
  }

  async function deleteOffer(id: string) {
    if (!confirm('Delete this offer?')) return
    try {
      await fetch(`/api/properties/${propertyId}/lead-offers/${id}`, { method: 'DELETE' })
      setOffers((prev) => prev.filter((o) => o.id !== id))
      toast.success('Offer deleted')
      router.refresh()
    } catch { toast.error('Failed to delete') }
  }

  function startEdit(offer: Offer) {
    setEditingId(offer.id)
    setEditPrice(String(offer.offerPrice))
    setEditType(offer.offerType)
    setEditDate(offer.offerDate.split('T')[0])
  }

  async function saveEdit() {
    if (!editingId) return
    const price = parseFloat(editPrice.replace(/[^0-9.]/g, ''))
    if (!price) { toast.error('Invalid price'); return }
    setSaving(true)
    try {
      await fetch(`/api/properties/${propertyId}/lead-offers/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerPrice: price, offerType: editType, offerDate: editDate }),
      })
      setOffers((prev) => prev.map((o) => o.id === editingId ? { ...o, offerPrice: price, offerType: editType, offerDate: new Date(editDate).toISOString() } : o))
      setEditingId(null)
      toast.success('Offer updated')
      router.refresh()
    } catch { toast.error('Failed to update') }
    finally { setSaving(false) }
  }

  const fmtDate = (d: string) => {
    // Fix timezone: date-only strings parsed as UTC show previous day in US timezones
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  }
  const fmtPrice = (p: number) => `$${p.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Teal header */}
        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-white text-lg font-bold tracking-wide">Manage Offers</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {/* Property info */}
          <p className="text-sm text-gray-700 font-medium mb-4">
            {contactName && <>{contactName} &gt; </>}{propertyAddress}
          </p>

          {/* Offer table */}
          {loading ? (
            <p className="text-sm text-gray-400 py-4">Loading offers...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-semibold text-gray-700">Offer Made By</th>
                    <th className="text-left py-3 px-2 font-semibold text-gray-700">Offer Date</th>
                    <th className="text-left py-3 px-2 font-semibold text-gray-700">Time Elapsed</th>
                    <th className="text-left py-3 px-2 font-semibold text-gray-700">Offer Type</th>
                    <th className="text-left py-3 px-2 font-semibold text-gray-700">Offer Price</th>
                    <th className="text-left py-3 px-2 font-semibold text-gray-700">Difference</th>
                    <th className="text-left py-3 px-2 font-semibold text-gray-700">Added By</th>
                    <th className="text-left py-3 px-2 font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-6 text-gray-400">No offers yet</td></tr>
                  ) : (
                    offers.map((offer, idx) => {
                      const isSeller = offer.offerBy === 'SELLER_OFFER'
                      const isEditing = editingId === offer.id
                      return (
                        <tr key={offer.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-amber-50/30' : ''}`}>
                          <td className={`py-3 px-2 font-medium ${isSeller ? 'text-blue-700' : 'text-amber-700'}`}>
                            {isSeller ? 'Seller Offer' : 'Our Offer'}
                          </td>
                          <td className="py-3 px-2 text-blue-700">
                            {isEditing ? <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="border rounded px-1 py-0.5 text-xs w-32" /> : fmtDate(offer.offerDate)}
                          </td>
                          <td className="py-3 px-2 text-blue-700">{getTimeElapsed(offer.offerDate, idx)}</td>
                          <td className="py-3 px-2 text-blue-700">
                            {isEditing ? (
                              <select value={editType} onChange={(e) => setEditType(e.target.value)} className="border rounded px-1 py-0.5 text-xs">
                                <option value="VERBAL">Verbal</option>
                                <option value="WRITTEN">Written</option>
                              </select>
                            ) : offer.offerType}
                          </td>
                          <td className="py-3 px-2 text-blue-700 font-medium">
                            {isEditing ? (
                              <div className="flex items-center border rounded px-1 py-0.5">
                                <span className="text-xs text-gray-400 mr-0.5">$</span>
                                <input type="text" value={fmtCommas(editPrice)} onChange={(e) => setEditPrice(e.target.value.replace(/,/g, ''))} className="text-xs outline-none w-20" />
                              </div>
                            ) : fmtPrice(offer.offerPrice)}
                          </td>
                          <td className={`py-3 px-2 font-medium ${getDifference(idx).startsWith('-') ? 'text-red-600' : 'text-gray-700'}`}>
                            {getDifference(idx)}
                          </td>
                          <td className="py-3 px-2 text-gray-600 text-xs">{offer.createdByName ?? '—'}</td>
                          <td className="py-3 px-2">
                            <div className="flex gap-1">
                              {isEditing ? (
                                <>
                                  <button onClick={saveEdit} disabled={saving} className="text-[10px] text-blue-600 font-medium hover:text-blue-800">Save</button>
                                  <button onClick={() => setEditingId(null)} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startEdit(offer)} className="p-1 text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                                  <button onClick={() => deleteOffer(offer.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {offers.length > 0 && (
            <p className="text-center text-xs text-gray-400 py-2">End of list</p>
          )}

          {/* Add new offer row */}
          {showAdd ? (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3 flex-wrap">
              <select value={addOfferBy} onChange={(e) => setAddOfferBy(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Select Offer By</option>
                <option value="OUR_OFFER">Our Offer</option>
                <option value="SELLER_OFFER">Seller Offer</option>
              </select>
              <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <span className="text-gray-400">-</span>
              <select value={addType} onChange={(e) => setAddType(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Select Offer Type</option>
                <option value="VERBAL">Verbal</option>
                <option value="WRITTEN">Written</option>
              </select>
              <div className="flex items-center border border-gray-200 rounded-lg px-3 py-2 focus-within:ring-1 focus-within:ring-blue-500">
                <span className="text-sm text-gray-400 mr-1">$</span>
                <input type="text" value={fmtCommas(addPrice)} onChange={(e) => setAddPrice(e.target.value.replace(/,/g, ''))} placeholder="0" className="text-sm outline-none w-24" />
              </div>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-800 text-white rounded-lg hover:bg-gray-900">Cancel</button>
              <button onClick={addOffer} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '...' : 'Add Offer'}</button>
            </div>
          ) : (
            <div className="mt-4 flex justify-center">
              <button onClick={() => setShowAdd(true)} className="px-6 py-2.5 border-2 border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
                Add New Offer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
