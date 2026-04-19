'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { DuplicateWarningModal } from '@/components/ui/DuplicateWarningModal'

const inputCls =
  'w-full mt-0.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

type LeadType = 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'

interface Campaign {
  id: string
  name: string
  type: string
  leadSource?: { name: string } | null
  phoneNumber?: { number: string; friendlyName?: string | null } | null
}

interface Props {
  open: boolean
  onClose: () => void
  /**
   * When provided, the lead type is locked and the type selector is hidden.
   * Used by pipeline pages (e.g. /leads/dts) that only create DTS leads.
   */
  fixedLeadType?: LeadType
  /** Compact variant (tighter padding) used by the dashboard AddLead flow. */
  variant?: 'compact' | 'standard'
}

/**
 * Shared lead-creation modal. Replaces the near-duplicate NewLeadModal and
 * AddLeadModal. `fixedLeadType` toggles between pipeline-page behaviour
 * (type locked to DTS/DTA) and dashboard behaviour (user picks the type).
 */
export function LeadFormModal({ open, onClose, fixedLeadType, variant = 'standard' }: Props) {
  const router = useRouter()
  const isFixed = Boolean(fixedLeadType)

  const [leadType, setLeadType] = useState<LeadType>(fixedLeadType ?? 'DIRECT_TO_SELLER')
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('TX')
  const [zip, setZip] = useState('')
  const [source, setSource] = useState('')
  const [leadCampaignId, setLeadCampaignId] = useState('')
  const [defaultOutboundNumber, setDefaultOutboundNumber] = useState('')
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [twilioNumbers, setTwilioNumbers] = useState<Array<{ id: string; number: string; friendlyName: string | null }>>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<{ message: string; existingId: string; existingAddress: string; pipeline: string } | null>(null)

  const campaignTypeFilter = leadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'
  const filteredCampaigns = campaigns.filter((c) => !c?.type || c.type === campaignTypeFilter)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [sRes, cRes, tRes] = await Promise.all([
          fetch('/api/lead-sources'),
          fetch('/api/lead-campaigns'),
          fetch('/api/twilio-numbers'),
        ])
        const sJson = await sRes.json().catch(() => ({}))
        const cJson = await cRes.json().catch(() => ({}))
        const tJson = await tRes.json().catch(() => ({}))
        if (cancelled) return
        const sList = Array.isArray(sJson?.data) ? sJson.data : Array.isArray(sJson) ? sJson : []
        const cList = Array.isArray(cJson?.data) ? cJson.data : Array.isArray(cJson) ? cJson : []
        const tList = Array.isArray(tJson?.data) ? tJson.data : Array.isArray(tJson) ? tJson : []
        setSources(sList)
        setCampaigns(cList)
        setTwilioNumbers(tList)
      } catch {
        // ignore — dropdowns remain empty
      }
    }
    if (open) load()
    return () => { cancelled = true }
  }, [open])

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setLeadType(fixedLeadType ?? 'DIRECT_TO_SELLER')
      setStreetAddress(''); setCity(''); setState('TX'); setZip('')
      setSource(''); setLeadCampaignId(''); setDefaultOutboundNumber('')
      setContactFirstName(''); setContactLastName(''); setContactPhone(''); setContactEmail('')
      setError(null); setSaving(false); setDupWarning(null)
    }
  }, [open, fixedLeadType])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!streetAddress.trim()) { setError('Street address is required'); return }
    if (!contactFirstName.trim()) { setError('Contact first name is required'); return }
    if (!contactPhone.trim()) { setError('Contact phone number is required'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streetAddress: streetAddress.trim(),
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          zip: zip.trim() || undefined,
          leadType,
          source: source || undefined,
          leadCampaignId: (leadCampaignId && leadCampaignId !== '__other__') ? leadCampaignId : undefined,
          defaultOutboundNumber: defaultOutboundNumber || undefined,
          contactFirstName: contactFirstName.trim(),
          contactLastName: contactLastName.trim() || undefined,
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      const pipeline = leadType === 'DIRECT_TO_SELLER' ? 'dts' : 'dta'

      if (res.status === 409 && json.duplicateWarning) {
        const dw = json.duplicateWarning
        setDupWarning({ message: dw.message, existingId: dw.existingId, existingAddress: dw.existingAddress, pipeline })
        setSaving(false)
        return
      }

      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : (json?.error?.message ?? 'Failed to create lead'))
        setSaving(false)
        return
      }

      router.push(`/leads/${pipeline}/${json.data.id}`)
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead')
      setSaving(false)
    }
  }

  const title = isFixed
    ? `New ${leadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'} Lead`
    : 'Add New Lead'
  const compact = variant === 'compact'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative bg-white rounded-2xl shadow-xl w-full ${compact ? 'max-w-md p-5' : 'max-w-lg p-6'} mx-4 max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`font-semibold text-gray-900 ${compact ? 'text-base' : 'text-lg'}`}>{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Property</p>

          <div>
            <label className="text-[11px] text-gray-500">Street Address *</label>
            <input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} placeholder="123 Main St" className={inputCls} autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">State</label>
              <input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Zip</label>
              <input value={zip} onChange={(e) => setZip(e.target.value)} className={inputCls} />
            </div>
          </div>

          {!isFixed && (
            <div>
              <label className="text-[11px] text-gray-500">Lead Type *</label>
              <select
                value={leadType}
                onChange={(e) => {
                  setLeadType(e.target.value as LeadType)
                  setLeadCampaignId('')
                  setDefaultOutboundNumber('')
                }}
                className={inputCls}
              >
                <option value="DIRECT_TO_SELLER">Direct to Seller (DTS)</option>
                <option value="DIRECT_TO_AGENT">Direct to Agent (DTA)</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-[11px] text-gray-500">Source</label>
            <select
              value={source}
              onChange={(e) => {
                const newSrc = e.target.value
                setSource(newSrc)
                const c = filteredCampaigns.find((x) => x.id === leadCampaignId)
                if (c && c.leadSource?.name && c.leadSource.name !== newSrc) {
                  setLeadCampaignId('')
                }
              }}
              className={inputCls}
            >
              <option value="">— select source —</option>
              {sources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-gray-500">Lead Campaign</label>
            <select
              value={leadCampaignId}
              onChange={(e) => {
                const id = e.target.value
                setLeadCampaignId(id)
                const c = filteredCampaigns.find((x) => x.id === id)
                if (c?.leadSource?.name) setSource(c.leadSource.name)
                if (c?.phoneNumber?.number) setDefaultOutboundNumber(c.phoneNumber.number)
              }}
              className={inputCls}
            >
              <option value="">— no campaign —</option>
              {filteredCampaigns
                .filter((c) => !source || c.leadSource?.name === source)
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__other__">Other</option>
            </select>
            {!source && (
              <p className="text-[10px] text-gray-400 mt-0.5">Select a source to filter campaigns.</p>
            )}
          </div>

          <div>
            <label className="text-[11px] text-gray-500">Default Number</label>
            <select value={defaultOutboundNumber} onChange={(e) => setDefaultOutboundNumber(e.target.value)} className={inputCls}>
              <option value="">— select default number —</option>
              {twilioNumbers.map((n) => (
                <option key={n.id} value={n.number}>
                  {n.number}{n.friendlyName ? ` · ${n.friendlyName}` : ''}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide pt-1">Contact</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">First Name *</label>
              <input value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Last Name</label>
              <input value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">Phone *</label>
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(555) 000-0000" className={inputCls} required />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Email</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
            </div>
          </div>

          {error && <p className="text-[11px] text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Lead'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
      {dupWarning && (
        <DuplicateWarningModal
          type="lead"
          message={dupWarning.message}
          existingName={dupWarning.existingAddress}
          existingId={dupWarning.existingId}
          viewUrl={`/leads/${dupWarning.pipeline}/${dupWarning.existingId}`}
          onClose={() => setDupWarning(null)}
        />
      )}
    </div>
  )
}
