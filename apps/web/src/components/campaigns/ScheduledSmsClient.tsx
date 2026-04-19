'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { Clock, Pause, Play, X, ExternalLink } from 'lucide-react'

interface ScheduledSend {
  id: string
  campaignId: string
  campaignName: string
  propertyId: string
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    state: string | null
    propertyStatus: string
    leadType: string | null
  }
  currentStep: number
  totalSteps: number
  nextChannel: string | null
  nextFireAt: string | null
  pausedAt: string | null
  enrolledAt: string
}

function getDetailUrl(p: ScheduledSend['property']): string {
  switch (p.propertyStatus) {
    case 'IN_TM': return `/tm/${p.id}`
    case 'IN_INVENTORY': return `/inventory/${p.id}`
    case 'IN_DISPO': return `/dispo/${p.id}`
    case 'SOLD': return `/sold/${p.id}`
    case 'RENTAL': return `/rental/${p.id}`
    default: return `/leads/${p.leadType === 'DIRECT_TO_AGENT' ? 'dta' : 'dts'}/${p.id}`
  }
}

export function ScheduledSmsClient() {
  const [sends, setSends] = useState<ScheduledSend[] | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)

  async function load() {
    const r = await fetch('/api/scheduled-sends')
    const d = await r.json()
    setSends(d.sends ?? [])
  }

  useEffect(() => { load() }, [])

  async function action(id: string, act: 'pause' | 'resume' | 'cancel') {
    setActioning(id)
    try {
      await fetch(`/api/campaign-enrollments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act }),
      })
      await load()
    } finally {
      setActioning(null)
    }
  }

  if (sends === null) {
    return <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
  }

  if (sends.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No active drip enrollments</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {sends.length} active enrollment{sends.length !== 1 ? 's' : ''}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left px-4 py-2.5">Property</th>
            <th className="text-left px-4 py-2.5">Campaign</th>
            <th className="text-left px-4 py-2.5">Progress</th>
            <th className="text-left px-4 py-2.5">Next Send</th>
            <th className="text-left px-4 py-2.5">Status</th>
            <th className="text-left px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sends.map((s) => (
            <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link href={getDetailUrl(s.property)} className="hover:text-blue-600 transition-colors">
                    <p className="font-medium text-gray-900 truncate max-w-[180px]">
                      {s.property.streetAddress ?? 'Unknown'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {[s.property.city, s.property.state, (s.property as any).zip].filter(Boolean).join(', ')}
                    </p>
                  </Link>
                  <Link
                    href={getDetailUrl(s.property)}
                    className="w-5 h-5 flex-shrink-0 text-gray-300 hover:text-blue-500 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-700">{s.campaignName}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${s.totalSteps > 0 ? (s.currentStep / s.totalSteps) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500">{s.currentStep}/{s.totalSteps}</span>
                </div>
                {s.nextChannel && (
                  <span className="text-[10px] text-gray-400">{s.nextChannel}</span>
                )}
              </td>
              <td className="px-4 py-3">
                {s.nextFireAt ? (
                  <div>
                    <p className="text-[12px] font-medium text-gray-800 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      {formatDistanceToNow(new Date(s.nextFireAt), { addSuffix: true })}
                    </p>
                    <p className="text-[10px] text-gray-400">{format(new Date(s.nextFireAt), 'MMM d, h:mm a')}</p>
                  </div>
                ) : (
                  <span className="text-gray-300 text-[11px]">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {s.pausedAt ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
                    Paused
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                    Active
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  {s.pausedAt ? (
                    <button
                      onClick={() => action(s.id, 'resume')}
                      disabled={actioning === s.id}
                      title="Resume"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  ) : (
                    <button
                      onClick={() => action(s.id, 'pause')}
                      disabled={actioning === s.id}
                      title="Pause"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50"
                    >
                      <Pause className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  )}
                  <button
                    onClick={() => action(s.id, 'cancel')}
                    disabled={actioning === s.id}
                    title="Cancel"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
