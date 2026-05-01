'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Star } from 'lucide-react'
import { formatElapsed, activityColorClass } from '@/lib/format-elapsed'

type StageOption = { value: string; label: string }

const FALLBACK_TM_STAGES: StageOption[] = [
  { value: 'NEW_CONTRACT', label: 'New Contract' },
  { value: 'MARKETING_TO_BUYERS', label: 'Marketing to Buyers' },
  { value: 'SHOWING_TO_BUYERS', label: 'Showing to Buyers' },
  { value: 'EVALUATING_OFFERS', label: 'Evaluating Offers' },
  { value: 'ACCEPTED_OFFER', label: 'Accepted Offer' },
  { value: 'CLEAR_TO_CLOSE', label: 'Clear to Close' },
]

const FALLBACK_INVENTORY_STAGES: StageOption[] = [
  { value: 'NEW_INVENTORY', label: 'New Inventory' },
  { value: 'GETTING_ESTIMATES', label: 'Getting Estimates' },
  { value: 'UNDER_REHAB', label: 'Under Rehab' },
  { value: 'LISTED_FOR_SALE', label: 'Listed for Sale' },
  { value: 'UNDER_CONTRACT', label: 'Under Contract' },
]

function usePipelineStages(pipelineKey: string, fallback: StageOption[]): StageOption[] {
  const [stages, setStages] = useState<StageOption[]>(fallback)
  useEffect(() => {
    fetch(`/api/pipeline-stages?pipeline=${pipelineKey}`)
      .then((r) => r.json())
      .then((data) => {
        const raw = (data.data ?? []) as Array<{ stageCode: string; label: string; isActive: boolean; sortOrder: number }>
        const sorted = raw
          .filter((s) => s.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => ({ value: s.stageCode, label: s.label }))
        if (sorted.length > 0) setStages(sorted)
      })
      .catch(() => {})
  }, [pipelineKey])
  return stages
}

interface Props {
  id: string
  pipeline: 'tm' | 'inventory' | 'dispo'
  streetAddress: string | null
  city: string | null
  state: string | null
  zip: string | null
  propertyStatus: string
  tmStage: string | null
  inventoryStage: string | null
  isHot: boolean
  isFavorited: boolean
  contractDate: Date | null
  source: string | null
  createdAt: Date
  lastActivityAt?: Date | string | null
}

export function PipelineDetailHeader({
  id, pipeline, streetAddress, city, state, zip,
  propertyStatus, tmStage, inventoryStage, isHot, isFavorited,
  contractDate, source, createdAt, lastActivityAt,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const tmStages = usePipelineStages('tm', FALLBACK_TM_STAGES)
  const inventoryStages = usePipelineStages('inventory', FALLBACK_INVENTORY_STAGES)

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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">
              {streetAddress ?? 'Address Unknown'}
            </h1>
            <button onClick={() => patch({ isHot: !isHot })} title="Toggle hot">
              {isHot ? '🔥' : <Flame className="w-4 h-4 text-gray-300" />}
            </button>
            <button onClick={() => patch({ isFavorited: !isFavorited })} title="Toggle favorite">
              <Star className={`w-4 h-4 ${isFavorited ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {[city, state, zip].filter(Boolean).join(', ')}
            {source && <span className="ml-2 text-gray-400">· {source}</span>}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Added {new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {contractDate && (
              <> · Contract: {new Date(contractDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
            )}
          </p>
          {lastActivityAt && (
            <p className="text-[11px] mt-0.5">
              <span className="text-gray-400">Last activity: </span>
              <span className={activityColorClass(lastActivityAt)}>
                {formatElapsed(lastActivityAt)}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {saving && (
            <svg className="w-3.5 h-3.5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {pipeline === 'tm' && (
            <select
              value={tmStage ?? ''}
              onChange={(e) => patch({ tmStage: e.target.value })}
              disabled={saving}
              className={`border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-blue-500 ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <option value="" disabled>Set TM stage</option>
              {tmStages.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}

          {pipeline === 'inventory' && (
            <select
              value={inventoryStage ?? ''}
              onChange={(e) => patch({ inventoryStage: e.target.value })}
              disabled={saving}
              className={`border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-blue-500 ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <option value="" disabled>Set Inventory stage</option>
              {inventoryStages.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}

          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            propertyStatus === 'IN_TM' ? 'bg-blue-100 text-blue-700' :
            propertyStatus === 'IN_INVENTORY' ? 'bg-orange-100 text-orange-700' :
            propertyStatus === 'IN_DISPO' ? 'bg-purple-100 text-purple-700' :
            propertyStatus === 'SOLD' ? 'bg-green-100 text-green-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {propertyStatus.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
    </div>
  )
}
