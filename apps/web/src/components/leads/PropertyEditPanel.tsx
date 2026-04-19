'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Check, Loader2 } from 'lucide-react'
import { ChangeCampaignModal } from './ChangeCampaignModal'

const EXIT_STRATEGIES = [
  { value: '', label: '— not set —' },
  // Route A — TM + Dispo
  { value: 'WHOLESALE_ASSIGNMENT', label: 'Wholesale Assignment' },
  { value: 'WHOLESALE_DOUBLE_CLOSE', label: 'Wholesale Double Close' },
  { value: 'INSTALLMENT', label: 'Installment' },
  { value: 'SELLER_FINANCE', label: 'Seller Finance' },
  // Route B — TM → Inventory
  { value: 'FIX_AND_FLIP', label: 'Fix & Flip' },
  { value: 'JOINT_VENTURE', label: 'Joint Venture' },
  { value: 'NEW_CONSTRUCTION', label: 'New Construction' },
  { value: 'NOVATION', label: 'Novation' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PROJECT_MANAGEMENT', label: 'Project Management' },
  { value: 'RETAIL_LISTING', label: 'Retail Listing' },
  { value: 'SALE_LEASEBACK', label: 'Sale Leaseback' },
  { value: 'WHOLETAIL', label: 'Wholetail' },
  // Route C — TM → Rental
  { value: 'RENTAL', label: 'Rental' },
  { value: 'TURNKEY', label: 'Turnkey' },
]

export interface PropertyEditValues {
  exitStrategy: string | null
  askingPrice: number | null
  offerPrice: number | null
  arv: number | null
  repairEstimate: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  yearBuilt: number | null
  lotSize: number | null
  propertyType: string | null
  source: string | null
  campaignName: string | null
  leadCampaignId?: string | null
  defaultOutboundNumber?: string | null
  assignedToId: string | null
  tags: string[]
}

interface Props {
  propertyId: string
  initialValues: PropertyEditValues
  users: { id: string; name: string }[]
  /** Restrict campaign dropdown to a specific type — e.g. 'DTS' on DTS pages */
  campaignTypeFilter?: 'DTS' | 'DTA' | 'BUYER' | 'VENDOR'
}

interface LeadSourceOption { id: string; name: string }
interface LeadCampaignOption { id: string; name: string; type: string; leadSource?: { name: string } | null; phoneNumber?: { number: string; friendlyName?: string | null } | null }
interface TwilioNumberOption { id: string; number: string; friendlyName: string | null }

const inputCls =
  'w-full mt-0.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

export function PropertyEditPanel({ propertyId, initialValues, users, campaignTypeFilter }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sources, setSources] = useState<LeadSourceOption[]>([])
  const [campaigns, setCampaigns] = useState<LeadCampaignOption[]>([])
  const [twilioNumbers, setTwilioNumbers] = useState<TwilioNumberOption[]>([])

  const [values, setValues] = useState({
    exitStrategy: initialValues.exitStrategy ?? '',
    askingPrice: initialValues.askingPrice?.toString() ?? '',
    offerPrice: initialValues.offerPrice?.toString() ?? '',
    arv: initialValues.arv?.toString() ?? '',
    repairEstimate: initialValues.repairEstimate?.toString() ?? '',
    bedrooms: initialValues.bedrooms?.toString() ?? '',
    bathrooms: initialValues.bathrooms?.toString() ?? '',
    sqft: initialValues.sqft?.toString() ?? '',
    yearBuilt: initialValues.yearBuilt?.toString() ?? '',
    lotSize: initialValues.lotSize?.toString() ?? '',
    propertyType: initialValues.propertyType ?? '',
    source: initialValues.source ?? '',
    campaignName: initialValues.campaignName ?? '',
    leadCampaignId: initialValues.leadCampaignId ?? '',
    defaultOutboundNumber: initialValues.defaultOutboundNumber ?? '',
    assignedToId: initialValues.assignedToId ?? '',
    tags: initialValues.tags.join(', '),
  })

  // Listen for the global "open edit" event dispatched by the Actions menu
  useEffect(() => {
    function onOpen() {
      setOpen(true)
      setTimeout(() => {
        document.getElementById('property-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
    window.addEventListener('lead-edit-open', onOpen)
    return () => window.removeEventListener('lead-edit-open', onOpen)
  }, [])

  // Load LeadSources + LeadCampaigns + TwilioNumbers when the panel opens
  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch('/api/lead-sources').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch('/api/lead-campaigns').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch('/api/twilio-numbers').then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([srcJson, campJson, twJson]) => {
      const srcList: LeadSourceOption[] = (srcJson.data ?? []).filter((s: any) => s.isActive)
      setSources(srcList)
      const campList: LeadCampaignOption[] = (campJson.data ?? [])
      setCampaigns(
        campaignTypeFilter
          ? campList.filter((c) => c.type === campaignTypeFilter)
          : campList,
      )
      const twList: TwilioNumberOption[] = (twJson.data ?? [])
      setTwilioNumbers(twList)
    })
  }, [open, campaignTypeFilter])

  function set(key: keyof typeof values, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  // Build the PATCH payload — extracted so we can replay it after the
  // ChangeCampaignModal confirms the campaign-change path.
  function buildPayload(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
    return {
      exitStrategy: values.exitStrategy || null,
      askingPrice: values.askingPrice ? parseFloat(values.askingPrice) : null,
      offerPrice: values.offerPrice ? parseFloat(values.offerPrice) : null,
      arv: values.arv ? parseFloat(values.arv) : null,
      repairEstimate: values.repairEstimate ? parseFloat(values.repairEstimate) : null,
      bedrooms: values.bedrooms ? parseInt(values.bedrooms, 10) : null,
      bathrooms: values.bathrooms ? parseFloat(values.bathrooms) : null,
      sqft: values.sqft ? parseInt(values.sqft, 10) : null,
      yearBuilt: values.yearBuilt ? parseInt(values.yearBuilt, 10) : null,
      lotSize: values.lotSize ? parseFloat(values.lotSize) : null,
      propertyType: values.propertyType || null,
      source: values.source || null,
      campaignName: values.campaignName || null,
      leadCampaignId: values.leadCampaignId || null,
      defaultOutboundNumber: values.defaultOutboundNumber || null,
      assignedToId: values.assignedToId || null,
      tags: values.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ...overrides,
    }
  }

  // `committedCampaignId` tracks the leadCampaignId that's actually persisted
  // in the DB. It updates only after a successful migration (or on mount).
  // The dropdown's onChange compares against this to decide whether the
  // ChangeCampaignModal should open. First-time assignment (committed=null)
  // doesn't need migration — nothing to reassign.
  const [committedCampaignId, setCommittedCampaignId] = useState<string | null>(
    initialValues.leadCampaignId ?? null,
  )
  // `pendingCampaignChange`: null = no modal, string = target campaignId,
  // empty string = clearing the campaign (no target).
  const [pendingCampaignChange, setPendingCampaignChange] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError('')
    try {

      const payload = buildPayload()

      const res = await fetch(`/api/leads/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        let msg = `Failed to save (${res.status})`
        if (typeof body?.error === 'string') msg = body.error
        else if (body?.error?.formErrors?.length) msg = body.error.formErrors.join(', ')
        else if (body?.error?.fieldErrors) {
          const fields = Object.entries(body.error.fieldErrors)
            .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
            .join('; ')
          if (fields) msg = fields
        }
        throw new Error(msg)
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCampaignChangeConfirm(payload: {
    newCampaignId: string | null
    roleMappings: Array<{ oldRoleId: string; newRoleId: string | null }>
  }) {
    setSaving(true)
    setError('')
    try {
      // Transactional migration: campaign-id update + team re-evaluate + task/
      // appointment reassignment based on the admin's role-to-role mapping.
      const migrateRes = await fetch(`/api/leads/${propertyId}/change-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!migrateRes.ok) {
        const body = await migrateRes.json().catch(() => ({}))
        const msg = typeof body?.error === 'string' ? body.error : 'Failed to migrate campaign'
        throw new Error(msg)
      }

      // Mark the new campaign as committed so further Save actions won't
      // re-trigger the modal, and close it. The panel stays open so the
      // admin can continue editing source/phone/etc. before hitting Save.
      setCommittedCampaignId(payload.newCampaignId)
      setPendingCampaignChange(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change campaign')
      throw err
    } finally {
      setSaving(false)
    }
  }

  function handleCampaignChangeCancel() {
    // Revert the dropdown to the committed value and clear the pending target.
    set('leadCampaignId', committedCampaignId ?? '')
    // Restore campaignName to match — find the committed campaign in the list
    const c = committedCampaignId ? campaigns.find((x) => x.id === committedCampaignId) : null
    set('campaignName', c?.name ?? '')
    setPendingCampaignChange(null)
  }

  if (!open) {
    return (
      <button
        id="property-edit-panel"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-gray-400" />
          Edit Property Details
        </span>
        <span className="text-[11px] text-gray-400">Click to expand ›</span>
      </button>
    )
  }

  return (
    <>
    {pendingCampaignChange !== null && (
      <ChangeCampaignModal
        propertyId={propertyId}
        newCampaignId={pendingCampaignChange}
        onCancel={handleCampaignChangeCancel}
        onConfirm={handleCampaignChangeConfirm}
      />
    )}
    <div id="property-edit-panel" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-gray-500" />
          <span className="text-[13px] font-semibold text-gray-800">Edit Property Details</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 text-sm">
        {/* Financial */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Financial
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['askingPrice', 'Asking Price'],
                ['offerPrice', 'Offer Price'],
                ['arv', 'ARV'],
                ['repairEstimate', 'Repair Est.'],
              ] as [keyof typeof values, string][]
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-[11px] text-gray-500">{label}</label>
                <input
                  type="number"
                  placeholder="0"
                  className={inputCls}
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Exit Strategy */}
        <div>
          <label className="text-[11px] text-gray-500">Exit Strategy</label>
          <select
            className={inputCls}
            value={values.exitStrategy}
            onChange={(e) => set('exitStrategy', e.target.value)}
          >
            {EXIT_STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Property Details */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Property
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['bedrooms', 'Beds', '1'],
                ['bathrooms', 'Baths', '0.5'],
                ['sqft', 'Sq Ft', '1'],
                ['yearBuilt', 'Year Built', '1'],
              ] as [keyof typeof values, string, string][]
            ).map(([key, label, step]) => (
              <div key={key}>
                <label className="text-[11px] text-gray-500">{label}</label>
                <input
                  type="number"
                  step={step}
                  placeholder="—"
                  className={inputCls}
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="mt-2">
            <label className="text-[11px] text-gray-500">Property Type</label>
            <input
              type="text"
              placeholder="e.g. Single Family"
              className={inputCls}
              value={values.propertyType}
              onChange={(e) => set('propertyType', e.target.value)}
            />
          </div>
        </div>

        {/* Lead Info */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Lead Info
          </p>
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-gray-500">Source</label>
              <select
                className={inputCls}
                value={values.source}
                onChange={(e) => {
                  const newSrc = e.target.value
                  set('source', newSrc)
                  // If the current campaign's source no longer matches, clear it
                  const c = campaigns.find((x) => x.id === values.leadCampaignId)
                  if (c && c.leadSource?.name && c.leadSource.name !== newSrc) {
                    set('leadCampaignId', '')
                    set('campaignName', '')
                  }
                }}
              >
                <option value="">— select source —</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
                {/* Preserve a free-text source that isn't in the list */}
                {values.source && !sources.some((s) => s.name === values.source) && (
                  <option value={values.source}>{values.source} (custom)</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Lead Campaign</label>
              <select
                className={inputCls}
                value={values.leadCampaignId === '' && values.campaignName === 'Other' ? '__other__' : values.leadCampaignId}
                onChange={(e) => {
                  const id = e.target.value
                  // 1. Update the visible dropdown state + derived fields
                  if (id === '__other__') {
                    set('leadCampaignId', '')
                    set('campaignName', 'Other')
                  } else {
                    set('leadCampaignId', id)
                    const c = campaigns.find((x) => x.id === id)
                    if (c) {
                      set('campaignName', c.name)
                      if (c.leadSource?.name) set('source', c.leadSource.name)
                      if (c.phoneNumber?.number) set('defaultOutboundNumber', c.phoneNumber.number)
                    } else {
                      set('campaignName', '')
                    }
                  }

                  // 2. If this differs from what's committed in DB AND the lead
                  // already had a campaign, trigger the ChangeCampaignModal
                  // immediately so the admin can map tasks/appointments.
                  const normalized = id && id !== '__other__' ? id : null
                  if (committedCampaignId && committedCampaignId !== normalized) {
                    setPendingCampaignChange(normalized ?? '')
                  }
                }}
              >
                <option value="">— no campaign —</option>
                {campaigns
                  .filter((c) => !values.source || c.leadSource?.name === values.source)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                <option value="__other__">Other</option>
              </select>
              {!values.source && (
                <p className="text-[10px] text-gray-400 mt-0.5">Select a source to filter campaigns.</p>
              )}
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Default Number</label>
              <select
                className={inputCls}
                value={values.defaultOutboundNumber}
                onChange={(e) => set('defaultOutboundNumber', e.target.value)}
              >
                <option value="">— select default number —</option>
                {twilioNumbers.map((n) => (
                  <option key={n.id} value={n.number}>
                    {n.number}{n.friendlyName ? ` · ${n.friendlyName}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Assigned To</label>
              <select
                className={inputCls}
                value={values.assignedToId}
                onChange={(e) => set('assignedToId', e.target.value)}
              >
                <option value="">— unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Tags (comma-separated)</label>
              <input
                type="text"
                placeholder="tag1, tag2"
                className={inputCls}
                value={values.tags}
                onChange={(e) => set('tags', e.target.value)}
              />
            </div>
          </div>
        </div>

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50 transition-colors active:scale-95"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
    </>
  )
}
