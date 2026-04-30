'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'sms-campaign', label: 'SMS Campaign' },
  { key: 'import-log', label: 'Import Log' },
] as const

interface Props {
  tab: string
  children: ReactNode
}

export function BuyersPageLayout({ tab, children }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Buyers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cash buyers, agents, and active purchasers</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 mt-4 border-b border-gray-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'dashboard' ? '/buyers' : `/buyers?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  )
}
