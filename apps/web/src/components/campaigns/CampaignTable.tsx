'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

interface CampaignRow {
  id: string
  name: string
  type: 'DRIP' | 'BROADCAST'
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  market: { name: string } | null
  updatedAt: Date | string
  _count: { steps: number; enrollments: number }
}

const TYPE_BADGE: Record<string, string> = {
  DRIP: 'bg-blue-50 text-blue-700',
  BROADCAST: 'bg-purple-50 text-purple-700',
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-sky-50 text-sky-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
}

interface Props {
  rows: CampaignRow[]
  total: number
}

export function CampaignTable({ rows, total }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No campaigns yet — create one above.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {total} campaign{total !== 1 ? 's' : ''}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {['Name', 'Type', 'Status', 'Market', 'Steps', 'Enrolled', 'Updated'].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/campaigns/${row.id}`} className="font-medium text-blue-600 hover:underline truncate block max-w-[220px]">
                  {row.name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[row.type] ?? ''}`}>
                  {row.type}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[row.status] ?? ''}`}>
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">{row.market?.name ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600">{row._count.steps}</td>
              <td className="px-4 py-3 text-gray-600">{row._count.enrollments}</td>
              <td className="px-4 py-3 text-gray-400 text-[11px]">
                {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
