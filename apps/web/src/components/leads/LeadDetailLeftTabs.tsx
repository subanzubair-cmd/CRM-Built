'use client'

import { useState } from 'react'

export interface LeftTab {
  key: string
  label: string
  count?: number
  dot?: boolean // show notification dot
}

interface Props {
  tabs: LeftTab[]
  activeTab: string
  onTabChange: (key: string) => void
}

export function LeadDetailLeftTabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div className="flex items-center gap-0 border-b-2 border-gray-200 bg-white px-5 flex-shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-[2px] transition-colors ${
            activeTab === tab.key
              ? 'text-blue-700 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1 text-[10px] text-gray-400">({tab.count})</span>
          )}
          {tab.dot && (
            <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />
          )}
        </button>
      ))}
    </div>
  )
}
