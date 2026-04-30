'use client'

/**
 * DripCampaignsTable — replaces the older `CampaignTable` for the
 * dedicated /drip-campaigns page. Adds:
 *   - Module tabs (Leads / Buyers / Vendors / Sold) that switch the
 *     filtered view via a `?module=` searchParam round-trip.
 *   - Per-action-type count columns (SMS, Email, Reminders, Webhook
 *     Trigger, Tags, Status Change, Drip). RVM / Direct Mail /
 *     Outbound Voice AI are omitted — they're not part of our build.
 *   - A "Duration" subtitle under the campaign name showing the sum
 *     of all step delays (e.g. "39 days, 0 hours, 20 minutes").
 *   - Action column with edit / clone / delete buttons per row.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Copy, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Module = 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD'

interface CampaignRow {
  id: string
  name: string
  type: 'DRIP' | 'BROADCAST'
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  module: Module
  market: { name: string } | null
  updatedAt: Date | string
  _count: { steps: number; activeEnrollments: number }
  actionCounts: {
    SMS: number
    EMAIL: number
    REMINDERS: number
    WEBHOOK: number
    TAG_CHANGE: number
    STATUS_CHANGE: number
    DRIP_ENROLL: number
  }
  totalDurationMinutes: number
}

interface Props {
  rows: CampaignRow[]
  total: number
  activeModule: Module
}

const TABS: Array<{ value: Module; label: string }> = [
  { value: 'LEADS', label: 'Leads Drip' },
  { value: 'BUYERS', label: 'Buyers Drip' },
  { value: 'VENDORS', label: 'Vendors Drip' },
  { value: 'SOLD', label: 'Sold Drip' },
]

export function DripCampaignsTable({ rows, total, activeModule }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const [busyRow, setBusyRow] = useState<{ id: string; action: 'clone' | 'delete' } | null>(
    null,
  )

  function setModuleTab(next: Module) {
    const sp = new URLSearchParams(params?.toString() ?? '')
    sp.set('module', next)
    sp.delete('page')
    startTransition(() => {
      router.push(`/drip-campaigns?${sp.toString()}`)
    })
  }

  async function handleClone(id: string) {
    setBusyRow({ id, action: 'clone' })
    try {
      const res = await fetch(`/api/campaigns/${id}/clone`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(
          typeof err.error === 'string' ? err.error : 'Failed to clone campaign.',
        )
      }
      toast.success('Campaign duplicated.')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to clone campaign.')
    } finally {
      setBusyRow(null)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete drip campaign "${name}"? This cannot be undone.`))
      return
    setBusyRow({ id, action: 'delete' })
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        throw new Error(
          typeof err.error === 'string' ? err.error : 'Failed to delete campaign.',
        )
      }
      toast.success('Drip campaign deleted.')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete campaign.')
    } finally {
      setBusyRow(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Module tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Drip campaign modules">
          {TABS.map((t) => {
            const active = t.value === activeModule
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setModuleTab(t.value)}
                className={`whitespace-nowrap pb-2.5 px-0.5 text-[14px] font-semibold border-b-2 transition-colors ${
                  active
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            {total} drip campaign{total !== 1 ? 's' : ''}
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">
              No drip campaigns in {moduleLabel(activeModule)} yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-500 uppercase tracking-wide">
                    Campaign Name
                  </th>
                  {[
                    ['SMS', 'SMS'],
                    ['Email', 'EMAIL'],
                    ['Reminders', 'REMINDERS'],
                    ['Webhook Trigger', 'WEBHOOK'],
                    ['Tags', 'TAG_CHANGE'],
                    ['Status Change', 'STATUS_CHANGE'],
                    ['Drip', 'DRIP_ENROLL'],
                  ].map(([label]) => (
                    <th
                      key={label}
                      className="px-3 py-3 text-center text-[12px] font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-[12px] font-semibold text-gray-500 uppercase tracking-wide">
                    Active on Leads
                  </th>
                  <th className="px-4 py-3 text-center text-[12px] font-semibold text-gray-500 uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/drip-campaigns/${row.id}`}
                        className="block font-semibold text-teal-700 hover:underline truncate max-w-[260px]"
                      >
                        {row.name}
                      </Link>
                      <p className="text-[11px] text-gray-400 mt-0.5 inline-block bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5">
                        Duration: {formatDuration(row.totalDurationMinutes)}
                      </p>
                    </td>

                    <td className="px-3 py-3 text-center text-gray-700">
                      {row.actionCounts.SMS}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {row.actionCounts.EMAIL}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {row.actionCounts.REMINDERS}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {row.actionCounts.WEBHOOK}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {row.actionCounts.TAG_CHANGE}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {row.actionCounts.STATUS_CHANGE}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {row.actionCounts.DRIP_ENROLL}
                    </td>

                    <td className="px-4 py-3 text-center text-gray-500 text-[12px]">
                      {row._count.activeEnrollments}{' '}
                      {row._count.activeEnrollments === 1 ? 'Lead' : 'Leads'}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          href={`/drip-campaigns/${row.id}`}
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                          aria-label="Edit drip campaign"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleClone(row.id)}
                          disabled={busyRow?.id === row.id}
                          className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                          title="Duplicate"
                          aria-label="Duplicate drip campaign"
                        >
                          {busyRow?.id === row.id && busyRow.action === 'clone' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id, row.name)}
                          disabled={busyRow?.id === row.id}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Delete"
                          aria-label="Delete drip campaign"
                        >
                          {busyRow?.id === row.id && busyRow.action === 'delete' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function moduleLabel(m: Module): string {
  switch (m) {
    case 'LEADS':
      return 'Leads'
    case 'BUYERS':
      return 'Buyers'
    case 'VENDORS':
      return 'Vendors'
    case 'SOLD':
      return 'Sold'
  }
}

/**
 * Format total minutes as "X days, Y hours, Z minutes" matching the
 * Duration pill in the spec screenshot. We round-trip through whole
 * minutes only (no seconds), since step delays are stored in those
 * units to begin with.
 */
function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  const days = Math.floor(m / 1440)
  const remAfterDays = m - days * 1440
  const hours = Math.floor(remAfterDays / 60)
  const minutes = remAfterDays - hours * 60
  return `${days} day${days === 1 ? '' : 's'}, ${hours} hour${hours === 1 ? '' : 's'}, ${minutes} minute${minutes === 1 ? '' : 's'}`
}
