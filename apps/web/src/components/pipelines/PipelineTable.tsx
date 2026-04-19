'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Pagination } from '@/components/ui/Pagination'
import { formatElapsed, activityColorClass } from '@/lib/format-elapsed'

interface PipelineRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  propertyStatus: string
  tmStage: string | null
  inventoryStage: string | null
  isHot: boolean
  updatedAt: Date
  lastActivityAt?: Date | string | null
  contacts: Array<{
    contact: { firstName: string; lastName: string | null; phone: string | null }
  }>
  assignedTo: { name: string } | null
  _count: { tasks: number }
}

interface Props {
  rows: PipelineRow[]
  total: number
  basePath: string
  page: number
  pageSize: number
  stageLabel?: (row: PipelineRow) => string | null
  variant?: 'dispo'
}

const TM_STAGE_LABELS: Record<string, string> = {
  NEW_CONTRACT:         'New Contract',
  MARKETING_TO_BUYERS:  'Marketing',
  SHOWING_TO_BUYERS:    'Showing',
  EVALUATING_OFFERS:    'Evaluating Offers',
  ACCEPTED_OFFER:       'Accepted Offer',
  CLEAR_TO_CLOSE:       'Clear to Close',
}

const TM_STAGE_COLORS: Record<string, string> = {
  NEW_CONTRACT:         'bg-blue-50 text-blue-700',
  MARKETING_TO_BUYERS:  'bg-purple-50 text-purple-700',
  SHOWING_TO_BUYERS:    'bg-yellow-50 text-yellow-700',
  EVALUATING_OFFERS:    'bg-orange-50 text-orange-700',
  ACCEPTED_OFFER:       'bg-emerald-50 text-emerald-700',
  CLEAR_TO_CLOSE:       'bg-green-100 text-green-800',
}

const INV_STAGE_LABELS: Record<string, string> = {
  NEW_INVENTORY:      'New',
  GETTING_ESTIMATES:  'Getting Estimates',
  UNDER_REHAB:        'Under Rehab',
  LISTED_FOR_SALE:    'Listed',
  UNDER_CONTRACT:     'Under Contract',
}

const INV_STAGE_COLORS: Record<string, string> = {
  NEW_INVENTORY:      'bg-gray-100 text-gray-700',
  GETTING_ESTIMATES:  'bg-yellow-50 text-yellow-700',
  UNDER_REHAB:        'bg-orange-50 text-orange-700',
  LISTED_FOR_SALE:    'bg-blue-50 text-blue-700',
  UNDER_CONTRACT:     'bg-green-100 text-green-800',
}

export function PipelineTable({ rows, total, basePath, page, pageSize, stageLabel, variant }: Props) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No properties in this pipeline</p>
      </div>
    )
  }

  function renderStage(row: PipelineRow) {
    const stage = row.tmStage ?? row.inventoryStage
    if (!stage) return <span className="text-gray-300">—</span>

    const isTm = !!row.tmStage
    const labels = isTm ? TM_STAGE_LABELS : INV_STAGE_LABELS
    const colors = isTm ? TM_STAGE_COLORS : INV_STAGE_COLORS

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${colors[stage] ?? 'bg-gray-100 text-gray-700'}`}>
        {labels[stage] ?? stage}
      </span>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} propert{total !== 1 ? 'ies' : 'y'}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left px-4 py-2.5">Address</th>
            <th className="text-left px-4 py-2.5">Contact</th>
            <th className="text-left px-4 py-2.5">Stage</th>
            <th className="text-left px-4 py-2.5">Assigned</th>
            {variant === 'dispo' && (
              <>
                <th className="text-left px-4 py-2.5">Offers</th>
                <th className="text-left px-4 py-2.5">Buyers</th>
              </>
            )}
            <th className="text-left px-4 py-2.5">Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const primary = row.contacts[0]?.contact
            return (
              <tr
                key={row.id}
                onClick={() => router.push(`${basePath}/${row.id}`)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {row.isHot && <span>🔥</span>}
                    <div>
                      <p className="font-medium text-gray-900">{row.streetAddress ?? '—'}</p>
                      <p className="text-[11px] text-gray-400">{[row.city, row.state, (row as any).zip].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {primary ? (
                    <div>
                      <p className="text-gray-800">{[primary.firstName, primary.lastName].filter(Boolean).join(' ')}</p>
                      <p className="text-[11px] text-gray-400">{primary.phone ?? '—'}</p>
                    </div>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">{renderStage(row)}</td>
                <td className="px-4 py-3 text-gray-600">{row.assignedTo?.name ?? <span className="text-gray-300">—</span>}</td>
                {variant === 'dispo' && (
                  <>
                    <td className="px-4 py-3">
                      {(row as any)._count?.offers > 0
                        ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium">{(row as any)._count.offers} offer{(row as any)._count.offers !== 1 ? 's' : ''}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(row as any)._count?.buyerMatches > 0
                        ? <span className="text-[11px] text-gray-600">{(row as any)._count.buyerMatches} matched</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </>
                )}
                <td className="px-3 py-3 text-right">
                  <span className={`text-xs font-medium ${activityColorClass((row as any).lastActivityAt ?? row.updatedAt)}`}>
                    {formatElapsed((row as any).lastActivityAt ?? row.updatedAt)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Suspense>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Suspense>
    </div>
  )
}
