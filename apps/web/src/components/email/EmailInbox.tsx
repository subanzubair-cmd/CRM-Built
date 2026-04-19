'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Mail } from 'lucide-react'

interface EmailRow {
  id: string
  lastMessageAt: Date | string
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
    propertyStatus: string
  }
  _count: { messages: number }
}

interface Props {
  rows: EmailRow[]
  total: number
}

function propertyPath(p: { id: string; leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT' }): string {
  return `/inbox/${p.id}`
}

export function EmailInbox({ rows, total }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48 gap-2">
        <Mail className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-400">No email conversations yet.</p>
        <p className="text-xs text-gray-400">Use the Compose button to send the first email.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {total} email thread{total !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={propertyPath(row.property)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center flex-shrink-0">
              <Mail className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {row.property.streetAddress ?? 'No address'}
                {row.property.city ? `, ${row.property.city}` : ''}
              </p>
              <p className="text-[11px] text-gray-400">
                {row._count.messages} email{row._count.messages !== 1 ? 's' : ''} · {' '}
                {formatDistanceToNow(new Date(row.lastMessageAt), { addSuffix: true })}
              </p>
            </div>
            <span className="text-[11px] text-gray-400 bg-purple-50 rounded px-1.5 py-0.5">
              {row.property.leadType === 'DIRECT_TO_SELLER' ? 'DTS' : 'DTA'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
