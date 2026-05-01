'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DuplicateWarningModal } from '@/components/ui/DuplicateWarningModal'
import { toast } from 'sonner'

interface BuyerResult {
  id: string
  contactId: string
  contact: {
    firstName: string
    lastName: string | null
    phone: string | null
    email: string | null
  }
}

interface Props {
  propertyId: string
  stage: string
  onClose: () => void
}

export function AddBuyerToDispoModal({ propertyId, stage, onClose }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [dupWarning, setDupWarning] = useState<{ message: string; existingBuyerId: string; existingName: string } | null>(null)
  const [searchResults, setSearchResults] = useState<BuyerResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Search buyers as user types name, phone, or email
  const searchTerm = [name, phone, email].find((v) => v.trim().length >= 2) ?? ''

  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/buyers?search=${encodeURIComponent(searchTerm)}`)
        if (res.ok) {
          const data = await res.json()
          const buyers = data?.data ?? data?.rows ?? data ?? []
          setSearchResults(Array.isArray(buyers) ? buyers.slice(0, 8) : [])
          setShowResults(true)
        }
      } catch {}
      finally { setSearching(false) }
    }, 300)

    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [searchTerm])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Add existing buyer to this property's dispo pipeline
  async function addExistingBuyer(buyer: BuyerResult) {
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/buyer-matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: buyer.id, dispoStage: stage }),
      })
      if (res.ok) {
        toast.success(`Added ${buyer.contact.firstName} ${buyer.contact.lastName ?? ''} to pipeline`)
        onClose()
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to add buyer')
      }
    } catch {
      toast.error('Failed to add buyer')
    } finally {
      setSaving(false)
    }
  }

  // Create new buyer + add to pipeline
  async function createAndAdd() {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!phone.trim() && !email.trim()) { toast.error('Either phone or email is required'); return }
    setSaving(true)
    try {
      // Split name into first/last
      const parts = name.trim().split(/\s+/)
      const firstName = parts[0]
      const lastName = parts.slice(1).join(' ') || null

      // Create contact + buyer
      const createRes = await fetch('/api/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone.trim() || null,
          email: email.trim() || null,
          company: address.trim() || null,
          contactType: 'BUYER',
        }),
      })

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}))
        if (createRes.status === 409 && data.existingBuyerId) {
          setDupWarning({
            message: data.error,
            existingBuyerId: data.existingBuyerId,
            existingName: `${firstName} ${lastName ?? ''}`.trim(),
          })
          return
        }
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to create buyer')
        return
      }

      const buyerData = await createRes.json()
      const buyerId = buyerData?.data?.id ?? buyerData?.id

      if (!buyerId) {
        toast.error('Failed to get buyer ID')
        return
      }

      // Add to dispo pipeline
      const matchRes = await fetch(`/api/properties/${propertyId}/buyer-matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId, dispoStage: stage }),
      })

      if (matchRes.ok) {
        toast.success(`Created and added ${firstName} to pipeline`)
        onClose()
        router.refresh()
      } else {
        toast.error('Buyer created but failed to add to pipeline')
      }
    } catch {
      toast.error('Failed to create buyer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Add Buyer Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          {/* Full Name with autocomplete */}
          <div ref={dropdownRef} className="relative">
            <label className="text-sm font-semibold text-gray-800">Full Name <span className="text-red-500">*</span></label>
            <div className="relative mt-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Search className="w-4 h-4 text-gray-300 animate-pulse" />
                </div>
              )}
            </div>

            {/* Search results dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((buyer) => {
                  const bName = [buyer.contact.firstName, buyer.contact.lastName].filter(Boolean).join(' ')
                  return (
                    <button
                      key={buyer.id}
                      onClick={() => addExistingBuyer(buyer)}
                      disabled={saving}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                    >
                      <span className="text-sm font-medium text-gray-900">{bName}</span>
                      {' '}
                      {buyer.contact.email && <span className="text-xs text-gray-500">{buyer.contact.email}</span>}
                      {buyer.contact.phone && <span className="text-xs text-gray-500 ml-1">{buyer.contact.phone}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="text-sm font-semibold text-gray-800">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone Number"
              type="tel"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm font-semibold text-gray-800">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Company Name (optional) */}
          <div>
            <label className="text-sm font-semibold text-gray-800">Company Name <span className="text-xs font-normal text-gray-400">(optional)</span></label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Company Name"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={createAndAdd}
            disabled={saving || !name.trim() || (!phone.trim() && !email.trim())}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? 'Adding...' : 'Add Contact'}
          </button>
        </div>
      </div>

      {dupWarning && (
        <DuplicateWarningModal
          type="buyer"
          message={dupWarning.message}
          existingName={dupWarning.existingName}
          existingId={dupWarning.existingBuyerId}
          viewUrl={`/buyers/${dupWarning.existingBuyerId}`}
          useExistingLabel="Add existing buyer to pipeline"
          onUseExisting={async () => {
            setDupWarning(null)
            await addExistingBuyer({ id: dupWarning.existingBuyerId, contactId: '', contact: { firstName: dupWarning.existingName.split(' ')[0], lastName: dupWarning.existingName.split(' ').slice(1).join(' ') || null, phone: null, email: null } })
          }}
          onClose={() => { setDupWarning(null); setSaving(false) }}
        />
      )}
    </div>
  )
}
