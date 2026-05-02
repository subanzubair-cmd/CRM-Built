'use client'

import { formatPhone } from '@/lib/phone'

/**
 * Client wrapper for the bulk SMS blast detail page. Handles:
 *   - Status filter pill row (All / Queued / Sent / Delivered / Failed / Skipped)
 *   - "Cancel blast" button when the blast is still in flight
 *
 * Server fetches the blast + recipients once on initial load; the
 * client shells in-memory filtering since most blasts ship to <500
 * buyers and we already have all rows in hand.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Recipient = {
  id: string
  phone: string
  status: string
  failReason: string | null
  sentAt: Date | string | null
  deliveredAt: Date | string | null
  name: string
}

type Blast = {
  id: string
  name: string
  body: string
  status: string
  recipientCount: number
  sentCount: number
  deliveredCount: number
  failedCount: number
  createdAt: Date | string
}

const STATUS_BUCKETS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'SENT', label: 'Sent' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SKIPPED_DND', label: 'DND' },
  { value: 'SKIPPED_INVALID', label: 'Skipped' },
]

const STATUS_BADGE: Record<string, string> = {
  QUEUED: 'bg-gray-100 text-gray-600',
  SENT: 'bg-sky-50 text-sky-700',
  DELIVERED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-rose-50 text-rose-700',
  SKIPPED_DND: 'bg-amber-50 text-amber-700',
  SKIPPED_INVALID: 'bg-gray-100 text-gray-500',
}

export function BlastDetailClient({
  blast,
  recipients,
}: {
  blast: Blast
  recipients: Recipient[]
}) {
  const router = useRouter()
  const [filter, setFilter] = useState('ALL')
  const [cancelling, setCancelling] = useState(false)

  const filtered = useMemo(
    () =>
      filter === 'ALL'
        ? recipients
        : recipients.filter((r) => r.status === filter),
    [filter, recipients],
  )

  async function handleCancel() {
    if (!confirm(`Cancel blast "${blast.name}"? Any unsent recipients will be skipped.`)) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/buyers/bulk-sms/${blast.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Failed to cancel blast.')
      }
      toast.success('Blast cancelled.')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to cancel.')
    } finally {
      setCancelling(false)
    }
  }

  const inFlight =
    blast.status === 'QUEUED' || blast.status === 'SENDING'

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900 truncate">{blast.name}</h1>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  blast.status === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-700'
                    : blast.status === 'SENDING'
                      ? 'bg-sky-50 text-sky-700'
                      : blast.status === 'CANCELLED'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-amber-50 text-amber-700'
                }`}
              >
                {blast.status}
              </span>
            </div>
            <p className="text-[12px] text-gray-400">
              Sent {new Date(blast.createdAt).toLocaleString()}
            </p>
          </div>
          {inFlight && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-[13px] font-medium text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel blast'}
            </button>
          )}
        </div>

        {/* Body preview */}
        <div className="mt-3 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-[13px] text-gray-700 whitespace-pre-wrap">
          {blast.body}
        </div>

        {/* Counters */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { label: 'Recipients', value: blast.recipientCount, color: 'text-gray-700' },
            { label: 'Sent', value: blast.sentCount, color: 'text-sky-700' },
            { label: 'Delivered', value: blast.deliveredCount, color: 'text-emerald-700' },
            { label: 'Failed', value: blast.failedCount, color: 'text-rose-700' },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
            >
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">
                {c.label}
              </p>
              <p className={`text-lg font-semibold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recipient table + filter */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          {STATUS_BUCKETS.map((b) => {
            const active = filter === b.value
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => setFilter(b.value)}
                className={`text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {b.label}
              </button>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No recipients in this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-4 py-2.5">Recipient</th>
                  <th className="text-left px-4 py-2.5">Phone</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Sent At</th>
                  <th className="text-left px-4 py-2.5">Delivered At</th>
                  <th className="text-left px-4 py-2.5">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900">{r.name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-[12px]">
                      {formatPhone(r.phone)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-[12px] whitespace-nowrap">
                      {r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-[12px] whitespace-nowrap">
                      {r.deliveredAt ? new Date(r.deliveredAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-[12px]">
                      {r.failReason ?? '—'}
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
