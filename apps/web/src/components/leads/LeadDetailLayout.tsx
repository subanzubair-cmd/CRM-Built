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
    // Layout breakpoints:
    //   < md (≤768px) — STACK vertically. Left tabs on top, right
    //                   panel below, both scrollable. Avoids the
    //                   30%-of-narrow-viewport situation where the
    //                   call panel + recording player are unusably
    //                   crushed.
    //   ≥ md         — 70/30 split using explicit `basis-[70%] /
    //                   basis-[30%]` (NOT `flex-[7]/flex-[3]`)
    //                   because flex's grow defaults let inner
    //                   content push a panel wider than its share.
    //                   With min-w-0 the split stays exactly 70/30
    //                   regardless of inner width.
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
      {!rightExpanded && (
        <div className="md:basis-[70%] md:grow-0 md:shrink-0 min-w-0 flex flex-col overflow-hidden md:border-r md:border-b-0 border-b border-gray-200 bg-white md:max-h-none max-h-[60vh] md:flex-none flex-1">
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

      {/* Right panel — fixed 30% basis on md+, full-width and below
          left on small viewports. */}
      <div
        className={`${
          rightExpanded
            ? 'flex-1'
            : 'md:basis-[30%] md:grow-0 md:shrink-0 flex-1'
        } min-w-0 flex flex-col bg-white overflow-hidden transition-all`}
      >
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
