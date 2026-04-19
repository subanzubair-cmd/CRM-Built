'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MessageSquare, Clock, X, Pause, Play } from 'lucide-react'

interface ScheduledItem {
  id: string
  campaignName: string
  propertyId: string
  propertyAddress: string
  currentStep: number
  totalSteps: number
  nextStepContent: string
  scheduledAt: string | null
  channel: string
  pausedAt: string | null
  propertyStatus: string
  leadType: string | null
}

function propertyHref(p: { id: string; propertyStatus: string; leadType?: string | null }): string {
  if (p.propertyStatus === 'IN_TM') return `/tm/${p.id}`
  if (p.propertyStatus === 'IN_INVENTORY') return `/inventory/${p.id}`
  if (p.propertyStatus === 'IN_DISPO') return `/dispo/${p.id}`
  if (p.propertyStatus === 'SOLD') return `/sold/${p.id}`
  if (p.propertyStatus === 'RENTAL') return `/rental/${p.id}`
  return `/leads/${p.leadType === 'DIRECT_TO_AGENT' ? 'dta' : 'dts'}/${p.id}`
}

export function ScheduledSMSList() {
  const [items, setItems] = useState<ScheduledItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)

  async function load() {
    const r = await fetch('/api/scheduled-sms')
    const json = await r.json()
    setItems(json.data ?? [])
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleAction(id: string, action: 'pause' | 'resume' | 'cancel') {
    if (action === 'cancel' && !confirm('Cancel this scheduled message sequence?')) return
    setActioning(id)
    try {
      await fetch(`/api/scheduled-sms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (action === 'cancel') {
        setItems((prev) => prev.filter((i) => i.id !== id))
      } else {
        await load()
      }
    } finally {
      setActioning(null)
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No scheduled messages</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {items.length} active enrollment{items.length !== 1 ? 's' : ''}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Step</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Message Preview</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Scheduled</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3">
                <Link href={propertyHref({ id: item.propertyId, propertyStatus: item.propertyStatus, leadType: item.leadType })} className="text-blue-600 hover:underline text-sm font-medium">
                  {item.propertyAddress || 'Unknown'}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-700">{item.campaignName}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {item.currentStep + 1} / {item.totalSteps}
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-xs">
                <p className="truncate text-xs">{item.nextStepContent || '—'}</p>
              </td>
              <td className="px-4 py-3">
                {item.scheduledAt ? (
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <Clock className="w-3 h-3" />
                    {new Date(item.scheduledAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {item.pausedAt ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
                    Paused
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                    Active
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center gap-1 justify-end">
                  {item.pausedAt ? (
                    <button
                      onClick={() => handleAction(item.id, 'resume')}
                      disabled={actioning === item.id}
                      title="Resume"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(item.id, 'pause')}
                      disabled={actioning === item.id}
                      title="Pause"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50"
                    >
                      <Pause className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(item.id, 'cancel')}
                    disabled={actioning === item.id}
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
