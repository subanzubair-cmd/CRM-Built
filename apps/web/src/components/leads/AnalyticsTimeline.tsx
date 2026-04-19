'use client'

import { useState, useEffect } from 'react'
import { format, differenceInDays } from 'date-fns'
import { ManageOffersModal } from './ManageOffersModal'

interface Props {
  propertyId: string
  propertyAddress?: string
  contactName?: string
  createdAt: Date | string
  activeLeadStage?: string | null
  appointmentDate?: Date | string | null
  offerDate?: Date | string | null
  offerPrice?: number | null
  contractDate?: Date | string | null
  contractPrice?: number | null
  expectedProfit?: number | null
}

function toDate(v: Date | string): Date {
  if (typeof v === 'string') {
    // Fix timezone: date-only strings like "2026-04-12" are parsed as UTC midnight,
    // which shows as previous day in US timezones. Add noon time to avoid this.
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T12:00:00')
    return new Date(v)
  }
  return v
}

function formatDate(v: Date | string): string {
  return format(toDate(v), 'MMM d, yyyy')
}

function formatCurrency(v: number): string {
  return `$${v.toLocaleString()}`
}

interface OfferSummary {
  sellerOffer: { price: number; date: string } | null
  ourOffer: { price: number; date: string } | null
  count: number
}

// Pipeline stages in order — a milestone is "reached" if the current stage is at or past it
const STAGE_ORDER = ['NEW_LEAD', 'DISCOVERY', 'INTERESTED_ADD_TO_FOLLOW_UP', 'VETTED_AGENTS', 'APPOINTMENT_MADE', 'DUE_DILIGENCE', 'OFFER_MADE', 'OFFER_FOLLOW_UP', 'UNDER_CONTRACT']

function stageReached(current: string | null | undefined, target: string): boolean {
  if (!current) return false
  const ci = STAGE_ORDER.indexOf(current)
  const ti = STAGE_ORDER.indexOf(target)
  return ci >= 0 && ti >= 0 && ci >= ti
}

export function AnalyticsTimeline({
  propertyId,
  propertyAddress,
  contactName,
  createdAt,
  activeLeadStage,
  appointmentDate,
  offerDate,
  offerPrice,
  contractDate,
  contractPrice,
  expectedProfit,
}: Props) {
  const [showManage, setShowManage] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [offerSummary, setOfferSummary] = useState<OfferSummary>({ sellerOffer: null, ourOffer: null, count: 0 })
  const [stageDates, setStageDates] = useState<Record<string, string>>({})

  // Fetch stage history dates
  useEffect(() => {
    fetch(`/api/properties/${propertyId}/lead-offers`) // reuse existing fetch cycle
    // Also try to get stage history
    fetch(`/api/inbox/${propertyId}/context`)
      .then((r) => r.ok ? r.json() : null)
      .then(() => {})
      .catch(() => {})
  }, [propertyId])

  // Fetch offer summary
  useEffect(() => {
    fetch(`/api/properties/${propertyId}/lead-offers`)
      .then((r) => r.json())
      .then((d) => {
        const offers = d.data ?? []
        // Get the latest offer from each side (sorted by date desc)
        const sellerOffers = offers.filter((o: any) => o.offerBy === 'SELLER_OFFER').sort((a: any, b: any) => new Date(b.offerDate).getTime() - new Date(a.offerDate).getTime())
        const ourOffers = offers.filter((o: any) => o.offerBy === 'OUR_OFFER').sort((a: any, b: any) => new Date(b.offerDate).getTime() - new Date(a.offerDate).getTime())
        const seller = sellerOffers[0] ?? null
        const our = ourOffers[0] ?? null
        setOfferSummary({
          sellerOffer: seller ? { price: seller.offerPrice, date: seller.offerDate } : null,
          ourOffer: our ? { price: our.offerPrice, date: our.offerDate } : null,
          count: offers.length,
        })
      })
      .catch(() => {})
  }, [propertyId, showManage, refreshKey]) // re-fetch when modal closes or refreshKey changes

  const daysInPipeline = differenceInDays(new Date(), toDate(createdAt))

  // Build offer display — show both seller + our offer with dates
  const offerAmounts: string[] = []
  if (offerSummary.sellerOffer) {
    offerAmounts.push(`Seller: ${formatCurrency(offerSummary.sellerOffer.price)} (${formatDate(offerSummary.sellerOffer.date)})`)
  }
  if (offerSummary.ourOffer) {
    offerAmounts.push(`Ours: ${formatCurrency(offerSummary.ourOffer.price)} (${formatDate(offerSummary.ourOffer.date)})`)
  }
  // Fallback to the single offerPrice if no LeadOffer records exist
  if (offerAmounts.length === 0 && offerPrice != null) {
    offerAmounts.push(formatCurrency(offerPrice))
  }

  const hasOffers = offerAmounts.length > 0

  const milestones = [
    { label: 'Lead created', date: createdAt, amounts: [] as string[], manage: false, forceActive: true },
    { label: 'Appointment', date: appointmentDate ?? null, amounts: [] as string[], manage: false, forceActive: stageReached(activeLeadStage, 'APPOINTMENT_MADE') },
    { label: 'Offer made', date: null, amounts: offerAmounts, manage: true, forceActive: stageReached(activeLeadStage, 'OFFER_MADE') },
    {
      label: 'Under contract',
      date: contractDate ?? null,
      amounts: [
        ...(contractPrice != null ? [formatCurrency(contractPrice)] : []),
      ],
      manage: false,
      forceActive: stageReached(activeLeadStage, 'UNDER_CONTRACT'),
    },
    {
      label: 'Expected Profit',
      date: null,
      amounts: expectedProfit != null ? [formatCurrency(expectedProfit)] : [],
      manage: false,
      forceActive: expectedProfit != null,
    },
  ]

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Analytics Info</h3>
        <p className="text-xs text-gray-500 mb-4">
          Days In Pipeline:{' '}
          <span className="font-semibold text-gray-800">{daysInPipeline} Days</span>
        </p>

        <div className="relative pl-4">
          {/* Vertical connecting line */}
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" />

          <div className="space-y-5">
            {milestones.map((m) => {
              const hasDate = m.date != null
              const isActive = hasDate || m.amounts.length > 0 || (m as any).forceActive
              return (
                <div key={m.label} className="relative flex items-start gap-3">
                  {/* Dot */}
                  <div
                    className={`relative z-10 mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                      isActive
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 bg-white'
                    }`}
                  />

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 leading-tight">
                        {m.label}
                      </p>
                      {m.manage && (
                        <button
                          onClick={() => setShowManage(true)}
                          className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700 transition-colors"
                        >
                          Manage
                        </button>
                      )}
                    </div>
                    {hasDate && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Status Assigned Date: {formatDate(m.date!)}
                      </p>
                    )}
                    {m.amounts.map((amt, i) => (
                      <p key={i} className="text-xs text-gray-500">
                        {amt}
                      </p>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showManage && (
        <ManageOffersModal
          propertyId={propertyId}
          propertyAddress={propertyAddress ?? ''}
          contactName={contactName}
          onClose={() => { setShowManage(false); setRefreshKey(k => k + 1) }}
        />
      )}
    </>
  )
}
