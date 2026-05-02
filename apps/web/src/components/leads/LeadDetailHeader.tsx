'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Flame, Phone, MessageSquare, Mail, ChevronDown,
  ChevronLeft, ChevronRight, Tag, MoreHorizontal,
  Pencil, Trash2, Zap, GitMerge, Users, X, Wrench, FileText, ArrowRight,
  Home, Copy, Check, MapPin, BadgeCheck, CircleHelp,
} from 'lucide-react'
import { toast } from 'sonner'
import { UnderContractModal, type UnderContractData } from './UnderContractModal'
import { OfferMadeModal } from './OfferMadeModal'
import { SoldDetailsModal } from './SoldDetailsModal'
import { MergeLeadModal } from './MergeLeadModal'
import { MoveToBuyerModal } from './MoveToBuyerModal'
import { MoveToVendorModal } from './MoveToVendorModal'
import { DeadLeadReasonModal } from './DeadLeadReasonModal'
import { ActivateDripModal } from '@/components/campaigns/ActivateDripModal'
import { DripStatusBadge } from './DripStatusBadge'
import { DripContinuationModal } from './DripContinuationModal'
import { formatPhone } from '@/lib/phone'

/* ── Pipeline stages + move-out statuses ── */
const DTS_PIPELINE_STAGES = [
  { value: 'NEW_LEAD', label: 'New Lead' },
  { value: 'DISCOVERY', label: 'Discovery' },
  { value: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested / Follow Up' },
  { value: 'APPOINTMENT_MADE', label: 'Appointment Made' },
  { value: 'DUE_DILIGENCE', label: 'Due Diligence' },
  { value: 'OFFER_MADE', label: 'Offer Made' },
  { value: 'OFFER_FOLLOW_UP', label: 'Offer Follow Up' },
  { value: 'UNDER_CONTRACT', label: 'Under Contract' },
]

const DTA_PIPELINE_STAGES = [
  { value: 'NEW_LEAD', label: 'New Lead' },
  { value: 'DISCOVERY', label: 'Discovery' },
  { value: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested / Follow Up' },
  { value: 'DUE_DILIGENCE', label: 'Due Diligence' },
  { value: 'OFFER_MADE', label: 'Offer Made' },
  { value: 'OFFER_FOLLOW_UP', label: 'Offer Follow Up' },
  { value: 'UNDER_CONTRACT', label: 'Under Contract' },
]

const MOVE_OUT_STATUSES = [
  { value: 'WARM', label: 'Warm Lead' },
  { value: 'REFERRED_TO_AGENT', label: 'Referred to Agent' },
  { value: 'DEAD', label: 'Dead Lead' },
]

const TM_STAGES = [
  { value: 'NEW_CONTRACT', label: 'New Contract' },
  { value: 'MARKETING_TO_BUYERS', label: 'Marketing To Buyers' },
  { value: 'SHOWING_TO_BUYERS', label: 'Showing To Buyers' },
  { value: 'EVALUATING_OFFERS', label: 'Evaluating Offers' },
  { value: 'ACCEPTED_OFFER', label: 'Accepted Offer' },
  { value: 'CLEAR_TO_CLOSE', label: 'Clear To Close' },
]

const TM_MOVE_OPTIONS = [
  { value: 'PROMOTE_DEAD', label: 'Dead Lead' },
  { value: 'PROMOTE_INVENTORY', label: 'Inventory' },
  { value: 'PROMOTE_RENTAL', label: 'Rental' },
  { value: 'PROMOTE_SOLD', label: 'Sold' },
]

const INVENTORY_STAGES = [
  { value: 'NEW_INVENTORY', label: 'New Inventory' },
  { value: 'GETTING_ESTIMATES', label: 'Getting Estimates' },
  { value: 'UNDER_REHAB', label: 'Under Rehab' },
  { value: 'LISTED_FOR_SALE', label: 'Listed For Sale' },
  { value: 'UNDER_CONTRACT', label: 'Under Contract' },
]

const INVENTORY_MOVE_OPTIONS = [
  { value: 'PROMOTE_DEAD', label: 'Dead Lead' },
  { value: 'PROMOTE_DISPO', label: 'Dispo' },
  { value: 'PROMOTE_RENTAL', label: 'Rental' },
  { value: 'PROMOTE_SOLD', label: 'Sold' },
]

const EXIT_STRATEGIES = [
  { value: 'WHOLESALE_ASSIGNMENT', label: 'Wholesale - Assignment' },
  { value: 'WHOLESALE_DOUBLE_CLOSE', label: 'Wholesale - Double Close' },
  { value: 'INSTALLMENT', label: 'Installment Sale' },
  { value: 'SELLER_FINANCE', label: 'Seller Financed Sale' },
  { value: 'FIX_AND_FLIP', label: 'Fix And Flip' },
  { value: 'JOINT_VENTURE', label: 'Joint Venture' },
  { value: 'NEW_CONSTRUCTION', label: 'New Construction' },
  { value: 'NOVATION', label: 'Novation' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PROJECT_MANAGEMENT', label: 'Project Management' },
  { value: 'RETAIL_LISTING', label: 'Retail Listing' },
  { value: 'SALE_LEASEBACK', label: 'Sale Leaseback' },
  { value: 'WHOLETAIL', label: 'Wholetail' },
  { value: 'RENTAL', label: 'Rental' },
  { value: 'TURNKEY', label: 'Turnkey' },
]

interface Props {
  id: string
  pipeline: 'dts' | 'dta'
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  activeLeadStage: string | null
  leadStatus: string
  isHot: boolean
  isQualified: boolean
  source: string | null
  createdAt: Date
  lastActivityAt?: Date | string | null
  underContractData?: UnderContractData
  campaignName: string | null
  exitStrategy: string | null
  contactPhone: string | null
  defaultOutboundNumber: string | null
  callCount: number
  smsCount: number
  emailCount: number
  contacts?: Array<{ contact: { id: string; firstName: string; lastName: string | null; phone: string | null; email: string | null } }>
  leadNumber?: string | null
  viewContext?: 'leads' | 'tm' | 'inventory' | 'dispo' | 'sold' | 'rental'
  tmStage?: string | null
  inventoryStage?: string | null
  prevLeadId?: string | null
  nextLeadId?: string | null
  tags?: string[]
}

export function LeadDetailHeader({
  id, pipeline, streetAddress, city, state, zip,
  activeLeadStage, leadStatus, isHot, isQualified, source,
  underContractData,
  campaignName, exitStrategy, contactPhone, defaultOutboundNumber,
  callCount, smsCount, emailCount,
  contacts,
  leadNumber,
  viewContext = 'leads',
  tmStage, inventoryStage,
  prevLeadId, nextLeadId,
  tags: initialTags = [],
}: Props) {
  const router = useRouter()
  const navBasePath =
    viewContext === 'tm' ? '/tm' :
    viewContext === 'inventory' ? '/inventory' :
    viewContext === 'dispo' ? '/dispo' :
    viewContext === 'sold' ? '/sold' :
    viewContext === 'rental' ? '/rental' :
    `/leads/${pipeline}`
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [pipelineStages, setPipelineStages] = useState<Array<{ value: string; label: string }>>(
    pipeline === 'dta' ? DTA_PIPELINE_STAGES : DTS_PIPELINE_STAGES,
  )
  const [tmStages, setTmStages] = useState(TM_STAGES)
  const [inventoryStages, setInventoryStages] = useState(INVENTORY_STAGES)

  useEffect(() => {
    const fetchStages = async (pipelineKey: string) => {
      try {
        const r = await fetch(`/api/pipeline-stages?pipeline=${pipelineKey}`)
        const data = await r.json()
        const raw = (data.data ?? []) as Array<{ stageCode: string; label: string; isActive: boolean; sortOrder: number }>
        return raw
          .filter((s) => s.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => ({ value: s.stageCode, label: s.label }))
      } catch { return null }
    }

    if (viewContext === 'leads') {
      const key = pipeline === 'dts' ? 'dts_leads' : 'dta_leads'
      fetchStages(key).then((s) => { if (s && s.length > 0) setPipelineStages(s) })
    } else if (viewContext === 'tm') {
      fetchStages('tm').then((s) => { if (s && s.length > 0) setTmStages(s) })
    } else if (viewContext === 'inventory') {
      fetchStages('inventory').then((s) => { if (s && s.length > 0) setInventoryStages(s) })
    }
  }, [pipeline, viewContext])
  const [showUCModal, setShowUCModal] = useState(false)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [showSoldModal, setShowSoldModal] = useState(false)
  const [showDeadModal, setShowDeadModal] = useState<null | 'lead' | 'promote'>(null)
  const [pendingValue, setPendingValue] = useState<string | null>(null)
  const [showActions, setShowActions] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagValue, setTagValue] = useState('')
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([])

  useEffect(() => {
    const category = pipeline === 'dts' ? 'dts' : 'dta'
    fetch(`/api/tags?category=${category}`)
      .then((r) => r.json())
      .then((d) => setAvailableTags(d.data ?? []))
      .catch(() => {})
  }, [pipeline])
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [showBuyerModal, setShowBuyerModal] = useState(false)
  const [showVendorModal, setShowVendorModal] = useState(false)
  const [showActivateDrip, setShowActivateDrip] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pendingStageMove, setPendingStageMove] = useState<{
    proceed: () => Promise<void>
    enrollments: any[]
  } | null>(null)
  const [showMap, setShowMap] = useState(false)


  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false)
      }
    }
    if (showActions) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showActions])

  async function patch(data: Record<string, unknown>) {
    setSaving(true)
    try {
      await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  async function checkAndMaybeShowDripModal(proceed: () => Promise<void>) {
    try {
      const res = await fetch(`/api/properties/${id}/drip-status`)
      const data = await res.json()
      const active = (data.data ?? []).filter((e: any) => e.isActive)
      if (active.length === 0) {
        await proceed()
        return
      }
      setPendingStageMove({ proceed, enrollments: active })
    } catch {
      // If the check fails, silently proceed with the move
      await proceed()
    }
  }

  async function handleUnifiedChange(value: string) {
    if (value.startsWith('PROMOTE_')) {
      const target = value.replace('PROMOTE_', '')
      const promoteMap: Record<string, string> = {
        DEAD: 'DEAD', INVENTORY: 'IN_INVENTORY', DISPO: 'IN_DISPO',
        RENTAL: 'RENTAL', SOLD: 'SOLD',
      }
      const toStatus = promoteMap[target]
      if (!toStatus) return
      if (toStatus === 'SOLD') { setShowSoldModal(true); return }
      if (toStatus === 'DEAD') { setShowDeadModal('promote'); return }
      setSaving(true)
      try {
        await fetch(`/api/properties/${id}/promote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStatus }),
        })
        if (toStatus === 'IN_INVENTORY') router.push(`/inventory/${id}`)
        else if (toStatus === 'IN_DISPO') router.push(`/dispo`)
        else if (toStatus === 'RENTAL') router.push(`/rental/${id}`)
        else startTransition(() => router.refresh())
      } finally { setSaving(false) }
      return
    }

    if (viewContext === 'tm' && tmStages.some((s) => s.value === value)) {
      await checkAndMaybeShowDripModal(async () => { await patch({ tmStage: value }) }); return
    }

    if (viewContext === 'inventory' && inventoryStages.some((s) => s.value === value)) {
      await checkAndMaybeShowDripModal(async () => { await patch({ inventoryStage: value }) }); return
    }

    const isStatus = MOVE_OUT_STATUSES.some((s) => s.value === value)
    if (value === 'OFFER_MADE') {
      setPendingValue(value); setShowOfferModal(true); return
    } else if (value === 'UNDER_CONTRACT') {
      setPendingValue(value); setShowUCModal(true)
    } else if (isStatus) {
      if (value === 'DEAD') { setShowDeadModal('lead'); return }
      await patch({ leadStatus: value })
      if (value === 'WARM') router.push(`/leads/warm?type=${pipeline}`)
      else if (value === 'REFERRED_TO_AGENT') router.push(`/leads/referred?type=${pipeline}`)
    } else {
      const reactivate = (leadStatus !== 'ACTIVE' && leadStatus !== 'LEAD') || ['DEAD', 'WARM', 'REFERRED', 'REFERRED_TO_AGENT'].includes(leadStatus)
        ? { leadStatus: 'ACTIVE', propertyStatus: 'LEAD', deadAt: null, warmAt: null, referredAt: null }
        : {}
      await checkAndMaybeShowDripModal(async () => {
        await patch({ activeLeadStage: value, ...reactivate })
        if (Object.keys(reactivate).length > 0) router.push(`/leads/${pipeline}/${id}`)
      })
    }
  }

  function handleExitChange(value: string) {
    patch({ exitStrategy: value || null })
  }

  const [liveTags, setLiveTags] = useState<string[]>(initialTags)

  async function ensureTagInCatalog(name: string) {
    // If the typed name isn't already in the catalog, create it so it shows in Settings.
    if (availableTags.some((t) => t.name === name)) return
    const category = pipeline === 'dts' ? 'dts' : 'dta'
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, color: '#3B82F6' }),
      })
      if (res.ok) {
        const data = await res.json()
        setAvailableTags((prev) => [...prev, data.data])
      }
    } catch { /* non-fatal — tag still gets added to property */ }
  }

  async function addTag() {
    const tag = tagValue.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag || liveTags.includes(tag)) { setTagValue(''); setShowTagInput(false); return }
    await ensureTagInCatalog(tag)
    const next = [...liveTags, tag]
    setLiveTags(next)
    await patch({ tags: next })
    setTagValue('')
    setShowTagInput(false)
  }

  async function removeTag(tag: string) {
    const next = liveTags.filter((t) => t !== tag)
    setLiveTags(next)
    await patch({ tags: next })
  }

  async function addTagByName(name: string) {
    if (liveTags.includes(name)) return
    const next = [...liveTags, name]
    setLiveTags(next)
    setShowTagInput(false)
    await patch({ tags: next })
  }

  async function deleteLead() {
    if (!confirm('Permanently delete this lead? This cannot be undone.')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    router.push(`/leads/${pipeline}`)
  }

  function copyAddress() {
    navigator.clipboard.writeText(fullAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const currentValue = pendingValue
    ?? (viewContext === 'tm' ? (tmStage ?? 'NEW_CONTRACT')
      : viewContext === 'inventory' ? (inventoryStage ?? 'NEW_INVENTORY')
      : leadStatus === 'ACTIVE' ? (activeLeadStage ?? '') : leadStatus)

  const fullAddress = [streetAddress, city, state, zip].filter(Boolean).join(', ') || 'Address Unknown'
  const encodedAddress = encodeURIComponent(fullAddress)

  const breadcrumbMap: Record<string, { label: string; href: string }> = {
    leads: { label: pipeline === 'dts' ? 'DTS Pipeline' : 'DTA Pipeline', href: `/leads/${pipeline}` },
    tm: { label: 'Transaction Management', href: '/tm' },
    inventory: { label: 'Inventory', href: '/inventory' },
    dispo: { label: 'Dispo', href: '/dispo' },
    sold: { label: 'Sold', href: '/sold' },
    rental: { label: 'Rental', href: '/rental' },
  }
  const { label: breadcrumbLabel, href: breadcrumbHref } = breadcrumbMap[viewContext] ?? breadcrumbMap.leads

  const defaultUCData: UnderContractData = {
    offerPrice: null, offerType: null, offerDate: null,
    expectedProfit: null, expectedProfitDate: null,
    contractDate: null, contractPrice: null,
    scheduledClosingDate: null, exitStrategy: null, contingencies: null,
    ...underContractData,
  }

  const displayPhone = defaultOutboundNumber ?? contactPhone

  return (
    <>
      {/* ── Modals ── */}
      {showUCModal && (
        <UnderContractModal
          propertyId={id}
          initialData={defaultUCData}
          onSave={() => { setShowUCModal(false); setPendingValue(null); startTransition(() => router.refresh()) }}
          onCancel={() => { setShowUCModal(false); setPendingValue(null) }}
        />
      )}

      {showOfferModal && (
        <OfferMadeModal
          propertyId={id}
          onClose={() => { setShowOfferModal(false); setPendingValue(null) }}
          onSaved={() => { setShowOfferModal(false); setPendingValue(null); startTransition(() => router.refresh()) }}
        />
      )}

      {showDeadModal && (
        <DeadLeadReasonModal
          onCancel={() => setShowDeadModal(null)}
          onConfirm={async ({ deadReasons, deadOtherReason }) => {
            const surface = showDeadModal
            setShowDeadModal(null)
            setSaving(true)
            try {
              if (surface === 'promote') {
                await fetch(`/api/properties/${id}/promote`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ toStatus: 'DEAD' }),
                })
                await fetch(`/api/leads/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ leadStatus: 'DEAD', deadReasons, deadOtherReason }),
                })
              } else {
                await fetch(`/api/leads/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ leadStatus: 'DEAD', deadReasons, deadOtherReason }),
                })
              }
              router.push(`/leads/dead?type=${pipeline}`)
            } finally { setSaving(false) }
          }}
        />
      )}

      {showSoldModal && (
        <SoldDetailsModal
          propertyId={id}
          onCancel={() => setShowSoldModal(false)}
          onConfirm={async (data) => {
            setShowSoldModal(false)
            setSaving(true)
            try {
              await Promise.all([
                fetch(`/api/properties/${id}/promote`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ toStatus: 'SOLD', soldAt: new Date().toISOString() }),
                }),
                fetch(`/api/leads/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ soldPrice: data.soldPrice }),
                }),
              ])
              ;(window as any).showPageLoading?.()
              window.location.href = `/sold/${id}`
              for (const buyer of data.buyers) {
                fetch(`/api/properties/${id}/offers`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ buyerId: buyer.buyerId, dispoOfferAmount: data.soldPrice }),
                }).catch(() => {})
              }
            } finally { setSaving(false) }
          }}
        />
      )}

      {showMergeModal && <MergeLeadModal propertyId={id} onClose={() => setShowMergeModal(false)} />}
      {showBuyerModal && <MoveToBuyerModal propertyId={id} contacts={contacts ?? []} onClose={() => setShowBuyerModal(false)} />}
      {showVendorModal && <MoveToVendorModal propertyId={id} contacts={contacts ?? []} onClose={() => setShowVendorModal(false)} />}

      <ActivateDripModal
        open={showActivateDrip}
        onClose={() => setShowActivateDrip(false)}
        subjectType="PROPERTY"
        subjectId={id}
        module={viewContext === 'sold' ? 'SOLD' : 'LEADS'}
        onActivated={() => router.refresh()}
      />

      {pendingStageMove && (
        <DripContinuationModal
          campaignName={pendingStageMove.enrollments[0].campaign.name}
          enrollmentId={pendingStageMove.enrollments[0].id}
          onKeepRunning={async () => {
            await pendingStageMove.proceed()
            setPendingStageMove(null)
          }}
          onStopDrip={async () => {
            for (const e of pendingStageMove.enrollments) {
              await fetch(`/api/campaign-enrollments/${e.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel' }),
              })
            }
            await pendingStageMove.proceed()
            setPendingStageMove(null)
          }}
        />
      )}

      {/* ── Google Map Popup ── */}
      {showMap && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setShowMap(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-[52vw] h-[48vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white flex-shrink-0">
              <span className="text-sm font-medium text-gray-800 truncate pr-4">{fullAddress}</span>
              <button onClick={() => setShowMap(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              src={`https://maps.google.com/maps?q=${encodedAddress}&output=embed&z=15`}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      )}

      {/* Street View — opens in Google Maps new tab (embedding requires paid API key) */}

      <div className="bg-white">

        {/* ═══ ROW 1 — Address bar + Nav ═══ */}
        <div className="flex items-center justify-between py-3 gap-2">

          {/* Left: pipeline badge + breadcrumb + address + action icons */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {/* Pipeline badge */}
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-sm font-bold uppercase tracking-wide flex-shrink-0 ${pipeline === 'dts' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
              <Home className="w-4 h-4" />
              {pipeline.toUpperCase()}
            </span>

            <a href={breadcrumbHref} className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap transition-colors flex-shrink-0">
              {breadcrumbLabel}
            </a>
            <span className="text-sm text-gray-400 flex-shrink-0">&gt;</span>
            <span className="text-base font-semibold text-gray-900 truncate">{fullAddress}</span>

            {/* Copy address */}
            <button
              onClick={copyAddress}
              title="Copy address"
              className="flex-shrink-0 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Qualified toggle */}
            <button
              onClick={() => patch({ isQualified: !isQualified })}
              title={isQualified ? 'Qualified — click to unqualify' : 'Not qualified — click to qualify'}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                isQualified
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-100'
              }`}
            >
              {isQualified ? <BadgeCheck className="w-3.5 h-3.5" /> : <CircleHelp className="w-3.5 h-3.5" />}
              {isQualified ? 'Qualified' : 'Not Qualified'}
            </button>

            {/* Hot toggle — after Qualified */}
            <button
              onClick={() => patch({ isHot: !isHot })}
              title={isHot ? 'Mark not hot' : 'Mark hot'}
              className="flex-shrink-0 p-1 rounded hover:bg-orange-50 transition-colors"
            >
              {isHot
                ? <Flame className="w-4 h-4 text-orange-500" />
                : <Flame className="w-4 h-4 text-gray-300 hover:text-orange-400" />}
            </button>

            {/* Google search — real Google G */}
            <a
              href={`https://www.google.com/search?q=${encodedAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Search on Google"
              className="flex-shrink-0 p-1 rounded hover:bg-gray-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </a>

            {/* Zillow — official icon */}
            <a
              href={`https://www.zillow.com/homes/${encodedAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View on Zillow"
              className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded hover:bg-blue-50 transition-colors"
            >
              <svg viewBox="0 0 23.283 25.577" className="w-3.5 h-3.5" fill="none" clipRule="evenodd" fillRule="evenodd" strokeLinejoin="round" strokeMiterlimit="2">
                <g fill="#006aff" fillRule="nonzero">
                  <path d="m15.743 6.897c.117-.026.169.013.24.091.403.448 1.691 2.021 2.041 2.45.065.078.02.163-.032.208-2.6 2.028-5.493 4.901-7.105 6.955-.032.046-.006.046.02.039 2.808-1.209 9.405-3.14 12.376-3.679v-3.763l-11.628-9.198-11.648 9.191v4.114c3.607-2.144 11.953-5.466 15.736-6.408z"/>
                  <path d="m6.279 22.705c-.097.052-.176.039-.254-.039l-2.171-2.587c-.058-.072-.065-.111.013-.221 1.678-2.457 5.103-6.286 7.287-7.904.039-.026.026-.059-.02-.039-2.275.741-8.742 3.523-11.134 4.875v8.787h23.277v-8.462c-3.172.539-12.675 3.367-16.998 5.59z"/>
                </g>
              </svg>
            </a>

            {/* Google Maps popup */}
            <button
              onClick={() => setShowMap(true)}
              title="View on Google Maps"
              className="flex-shrink-0 p-1 rounded hover:bg-red-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/>
                <circle cx="12" cy="9" r="2.5" fill="white"/>
              </svg>
            </button>

            {/* Active drip indicator — only renders when an enrollment exists */}
            <DripStatusBadge propertyId={id} />

          </div>

          {/* Right: saving spinner + prev/next + actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {saving && (
              <svg className="w-4 h-4 animate-spin text-blue-500 mr-1" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}

            <button
              onClick={() => prevLeadId && router.push(`${navBasePath}/${prevLeadId}`)}
              disabled={!prevLeadId}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => nextLeadId && router.push(`${navBasePath}/${nextLeadId}`)}
              disabled={!nextLeadId}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Actions dropdown */}
            <div className="relative" ref={actionsRef}>
              <button
                onClick={() => setShowActions(!showActions)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-500 text-sm font-medium transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
                Actions
              </button>

              {showActions && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-2 max-h-[400px] overflow-y-auto">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
                    <button onClick={() => {
                      setShowActions(false)
                      window.dispatchEvent(new CustomEvent('lead-edit-open'))
                      const el = document.getElementById('property-edit-panel')
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => { setShowActions(false); deleteLead() }} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>

                  {(viewContext === 'sold' || viewContext === 'rental') ? (
                    <>
                      <div className="px-4 py-2">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-2">Reaching Sellers</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="relative group">
                            <button className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors w-full">
                              <Phone className="w-4 h-4" /> Make Call
                            </button>
                            <div className="hidden group-hover:block absolute left-0 top-full mt-0.5 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                              {contacts?.map((c) => {
                                const cName = `${c.contact.firstName} ${c.contact.lastName ?? ''}`.trim()
                                return c.contact.phone ? (
                                  <button key={c.contact.id} onClick={() => { setShowActions(false); window.dispatchEvent(new CustomEvent('lead-call', { detail: { phone: c.contact.phone, name: cName } })) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 truncate">
                                    {cName} <span className="text-gray-400">({c.contact.phone})</span>
                                  </button>
                                ) : null
                              })}
                              {(!contacts || contacts.length === 0) && <p className="px-3 py-1.5 text-xs text-gray-400">No contacts</p>}
                            </div>
                          </div>
                          <div className="relative group">
                            <button className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors w-full">
                              <MessageSquare className="w-4 h-4" /> Send SMS
                            </button>
                            <div className="hidden group-hover:block absolute left-0 top-full mt-0.5 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                              {contacts?.map((c) => {
                                const cName = `${c.contact.firstName} ${c.contact.lastName ?? ''}`.trim()
                                return c.contact.phone ? (
                                  <button key={c.contact.id} onClick={() => { setShowActions(false); window.dispatchEvent(new CustomEvent('lead-sms', { detail: { phone: c.contact.phone, name: cName } })) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 truncate">
                                    {cName} <span className="text-gray-400">({c.contact.phone})</span>
                                  </button>
                                ) : null
                              })}
                              {(!contacts || contacts.length === 0) && <p className="px-3 py-1.5 text-xs text-gray-400">No contacts</p>}
                            </div>
                          </div>
                          <button onClick={() => { setShowActions(false); window.dispatchEvent(new CustomEvent('lead-compose', { detail: { mode: 'EMAIL' } })) }} className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <Mail className="w-4 h-4" /> Send Email
                          </button>
                        </div>
                      </div>
                      <div className="px-4 py-2 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-2">Automate</p>
                        <button onClick={() => { setShowActions(false); setShowActivateDrip(true) }} className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                          <Zap className="w-4 h-4" /> Activate Drip
                        </button>
                      </div>
                      <div className="px-4 py-2 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-2">Actions</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={async () => {
                            setShowActions(false)
                            if (!confirm('Move this property back to leads as a new lead?')) return
                            await patch({ leadStatus: 'ACTIVE', propertyStatus: 'LEAD', activeLeadStage: 'NEW_LEAD', soldAt: null })
                            router.push(`/leads/${pipeline}/${id}`)
                          }} className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <ChevronLeft className="w-4 h-4" /> Move to Leads
                          </button>
                          <button onClick={() => { setShowActions(false); toast.info('eSign coming soon') }} className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <FileText className="w-4 h-4" /> Send eSign
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="px-4 py-2">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-2">Actions</p>
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => { patch({ isHot: !isHot }); setShowActions(false) }} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <Flame className="w-4 h-4" /> {isHot ? 'Unmark Hot' : 'Mark Hot'}
                          </button>
                          <button onClick={() => { setShowActions(false); setShowActivateDrip(true) }} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <Zap className="w-4 h-4" /> Activate Drip
                          </button>
                        </div>
                      </div>
                      <div className="px-4 py-2 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-2">Migrate</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={async () => {
                            setShowActions(false)
                            const newType = pipeline === 'dts' ? 'DIRECT_TO_AGENT' : 'DIRECT_TO_SELLER'
                            const newPipeline = pipeline === 'dts' ? 'dta' : 'dts'
                            if (!confirm(`Move this lead to ${newPipeline.toUpperCase()} pipeline?`)) return
                            await patch({ leadType: newType })
                            router.push(`/leads/${newPipeline}/${id}`)
                          }} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <ArrowRight className="w-4 h-4" /> Move to {pipeline === 'dts' ? 'DTA' : 'DTS'}
                          </button>
                          <button onClick={() => { setShowActions(false); setShowMergeModal(true) }} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <GitMerge className="w-4 h-4" /> Merge Lead
                          </button>
                          <button onClick={() => { setShowActions(false); setShowBuyerModal(true) }} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <Users className="w-4 h-4" /> Move to Buyer
                          </button>
                          <button onClick={() => { setShowActions(false); setShowVendorModal(true) }} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 text-gray-600 text-[11px] transition-colors">
                            <Wrench className="w-4 h-4" /> Move to Vendor
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ ROW 2 — Stage + Exit + Source info | Comm stats ═══ */}
        <div className="flex items-center justify-between py-1 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap text-xs min-w-0">
            <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide flex-shrink-0">
              {viewContext === 'sold' ? 'SOLD' : viewContext === 'rental' ? 'RENTAL' : viewContext === 'tm' ? 'STATUS' : viewContext === 'inventory' ? 'STATUS' : 'LEAD'}
            </span>

            {(viewContext === 'sold' || viewContext === 'rental') ? (
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-600 text-white">
                {viewContext === 'sold' ? 'Sold' : 'Rental'}
              </span>
            ) : (
              <div className="relative flex-shrink-0">
                <select
                  value={currentValue || (viewContext === 'tm' ? 'NEW_CONTRACT' : viewContext === 'inventory' ? 'NEW_INVENTORY' : 'NEW_LEAD')}
                  onChange={(e) => handleUnifiedChange(e.target.value)}
                  disabled={saving}
                  className={`appearance-none bg-blue-600 text-white border border-blue-700 rounded-md pl-2 pr-6 py-0.5 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${saving ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'} transition-colors`}
                >
                  <option value="" disabled className="bg-white text-gray-700">Set Stage</option>
                  {viewContext === 'tm' ? (
                    <>
                      <optgroup label="TM Stages" className="bg-white text-gray-700">
                        {tmStages.map((s) => <option key={s.value} value={s.value} className="bg-white text-gray-700">{s.label}</option>)}
                      </optgroup>
                      <optgroup label="Move To" className="bg-white text-gray-700">
                        {TM_MOVE_OPTIONS.map((s) => <option key={s.value} value={s.value} className="bg-white text-gray-700">{s.label}</option>)}
                      </optgroup>
                    </>
                  ) : viewContext === 'inventory' ? (
                    <>
                      <optgroup label="Inventory Stages" className="bg-white text-gray-700">
                        {inventoryStages.map((s) => <option key={s.value} value={s.value} className="bg-white text-gray-700">{s.label}</option>)}
                      </optgroup>
                      <optgroup label="Move To" className="bg-white text-gray-700">
                        {INVENTORY_MOVE_OPTIONS.map((s) => <option key={s.value} value={s.value} className="bg-white text-gray-700">{s.label}</option>)}
                      </optgroup>
                    </>
                  ) : (
                    <>
                      <optgroup label="Pipeline Stages" className="bg-white text-gray-700">
                        {pipelineStages.map((s) => (
                          <option key={s.value} value={s.value} className="bg-white text-gray-700">{s.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Move Lead" className="bg-white text-gray-700">
                        {MOVE_OUT_STATUSES.map((s) => <option key={s.value} value={s.value} className="bg-white text-gray-700">{s.label}</option>)}
                      </optgroup>
                    </>
                  )}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-white pointer-events-none" />
              </div>
            )}

            <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide flex-shrink-0">Exit</span>
            {(viewContext === 'sold' || viewContext === 'rental') ? (
              <span className="bg-blue-600 text-white rounded-md px-2 py-0.5 text-xs font-medium flex-shrink-0">
                {EXIT_STRATEGIES.find(s => s.value === exitStrategy)?.label ?? exitStrategy ?? 'N/A'}
              </span>
            ) : (
              <div className="relative flex-shrink-0">
                <select
                  value={exitStrategy ?? ''}
                  onChange={(e) => handleExitChange(e.target.value)}
                  disabled={saving}
                  className={`appearance-none bg-blue-600 text-white border border-blue-700 rounded-md pl-2 pr-6 py-0.5 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${saving ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'} transition-colors`}
                >
                  <option value="" className="bg-white text-gray-700">Select Exit</option>
                  {EXIT_STRATEGIES.map((s) => <option key={s.value} value={s.value} className="bg-white text-gray-700">{s.label}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-white pointer-events-none" />
              </div>
            )}

            <span className="text-gray-300 flex-shrink-0">|</span>
            {source && <span className="text-gray-500 text-sm truncate max-w-[120px]" title={source}>{source}</span>}
            {campaignName && (
              <>
                <span className="text-gray-400 text-xs flex-shrink-0">&gt;</span>
                <span className="text-gray-500 text-sm truncate max-w-[150px]" title={campaignName}>{campaignName}</span>
              </>
            )}
            {defaultOutboundNumber && (
              <>
                <span className="text-gray-400 text-xs flex-shrink-0">&gt;</span>
                <span className="text-blue-600 text-sm font-medium flex-shrink-0">{formatPhone(defaultOutboundNumber)}</span>
              </>
            )}
          </div>

          {/* Comm stats — right side of Row 2 */}
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
            <span className="flex items-center gap-1" title="Calls">
              <Phone className="w-3.5 h-3.5 text-gray-400" /> x{callCount}
            </span>
            <span className="flex items-center gap-1" title="SMS">
              <MessageSquare className="w-3.5 h-3.5 text-gray-400" /> x{smsCount}
            </span>
            <span className="flex items-center gap-1" title="Emails">
              <Mail className="w-3.5 h-3.5 text-gray-400" /> x{emailCount}
            </span>
          </div>
        </div>

        {/* ═══ ROW 3 — Tags ═══ */}
        <div className="flex items-center gap-1.5 py-1 border-t border-gray-100 flex-wrap">
          {liveTags.map((tag) => {
            const def = availableTags.find((t) => t.name === tag)
            return (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide flex-shrink-0"
                style={def ? { backgroundColor: `${def.color}18`, color: def.color, border: `1px solid ${def.color}40` } : { backgroundColor: '#f3f4f6', color: '#374151' }}
              >
                {tag}
                <button onClick={() => removeTag(tag)} className="opacity-60 hover:opacity-100 transition-opacity">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )
          })}
          {showTagInput ? (
            <div className="relative flex-shrink-0">
              <input
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setShowTagInput(false) }}
                placeholder="Search tags..."
                autoFocus
                className="border border-blue-300 rounded-md px-2 py-0.5 text-[11px] w-32 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {availableTags.filter((t) => !liveTags.includes(t.name) && (!tagValue || t.name.toLowerCase().includes(tagValue.toLowerCase()))).length > 0 && (
                <div className="absolute left-0 top-full mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px] max-h-40 overflow-y-auto">
                  {availableTags
                    .filter((t) => !liveTags.includes(t.name) && (!tagValue || t.name.toLowerCase().includes(tagValue.toLowerCase())))
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setTagValue(''); addTagByName(t.name) }}
                        className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 flex items-center gap-1.5"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </button>
                    ))}
                </div>
              )}
              <button onClick={() => setShowTagInput(false)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowTagInput(true)} className="flex items-center gap-1 text-blue-600 text-xs hover:text-blue-800 transition-colors flex-shrink-0">
              <Tag className="w-3 h-3" />
              <span>+Add Tag</span>
            </button>
          )}
        </div>
      </div>
    </>
  )
}
