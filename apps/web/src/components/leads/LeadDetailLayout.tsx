'use client'

import { useState, type ReactNode } from 'react'
import { LeadDetailLeftTabs, type LeftTab } from './LeadDetailLeftTabs'
import { LeadDetailRightPanel } from './LeadDetailRightPanel'

interface Props {
  tabContent: Record<string, ReactNode>
  tabs: LeftTab[]
  defaultTab?: string
  propertyId: string
  messages: any[]
  notes: any[]
  activityLogs: any[]
  stageHistory: any[]
}

export function LeadDetailLayout({
  tabContent,
  tabs,
  defaultTab = 'details',
  propertyId,
  messages,
  notes,
  activityLogs,
  stageHistory,
}: Props) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [rightExpanded, setRightExpanded] = useState(false)

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left Panel (60%) ── */}
      {!rightExpanded && (
        <div className="flex-[7] flex flex-col overflow-hidden border-r border-gray-200 bg-white">
          {/* Sticky tab bar within left panel */}
          <div className="sticky top-0 z-10 bg-white flex-shrink-0">
            <LeadDetailLeftTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-4">
              {tabContent[activeTab] ?? (
                <div className="text-sm text-gray-400 text-center py-8">No content for this tab.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Right Panel ── */}
      <div className={`${rightExpanded ? 'flex-1' : 'flex-[3]'} flex flex-col bg-white overflow-hidden transition-all`}>
        <LeadDetailRightPanel
          propertyId={propertyId}
          messages={messages}
          notes={notes}
          activityLogs={activityLogs}
          stageHistory={stageHistory}
          expanded={rightExpanded}
          onToggleExpand={() => setRightExpanded(!rightExpanded)}
        />
      </div>
    </div>
  )
}
