'use client'

import { useState } from 'react'
import type { CampaignItem } from './UsersList'

export interface CampaignAssignment {
  campaignId: string
  assignNewLeads: boolean
  backfillExistingLeads: boolean
}

interface Props {
  userName: string
  roleName: string
  campaigns: CampaignItem[]
  assignments: CampaignAssignment[]
  enrolled: boolean
  onToggleEnrolled: (enrolled: boolean) => void
  onAssignmentsChange: (next: CampaignAssignment[]) => void
}

/**
 * Multi-campaign "Lead Access" configurator shown inside EditUserPanel and
 * AddUserPanel. Collects per-campaign toggles for new-lead auto-assignment
 * and existing-lead backfill.
 */
export function LeadAccessSection({
  userName,
  roleName,
  campaigns,
  assignments,
  enrolled,
  onToggleEnrolled,
  onAssignmentsChange,
}: Props) {
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE' || c.status === 'DRAFT')

  function isEnrolled(campaignId: string) {
    return assignments.some((a) => a.campaignId === campaignId)
  }

  function toggleCampaign(campaignId: string) {
    if (isEnrolled(campaignId)) {
      onAssignmentsChange(assignments.filter((a) => a.campaignId !== campaignId))
      if (expandedCampaign === campaignId) setExpandedCampaign(null)
    } else {
      onAssignmentsChange([
        ...assignments,
        { campaignId, assignNewLeads: false, backfillExistingLeads: false },
      ])
      setExpandedCampaign(campaignId)
    }
  }

  function updateAssignment(campaignId: string, patch: Partial<CampaignAssignment>) {
    onAssignmentsChange(
      assignments.map((a) => (a.campaignId === campaignId ? { ...a, ...patch } : a)),
    )
  }

  const prettyUser = userName.trim() || 'this user'
  const prettyRole = roleName.trim() || 'selected role'

  return (
    <div className="space-y-3">
      {/* Gate question */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-700 mb-3">
          Would you like <strong>{prettyUser}</strong> to be part of the Teams tab in Leads in the role of <strong>{prettyRole}</strong>?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onToggleEnrolled(true)}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              enrolled
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => { onToggleEnrolled(false); onAssignmentsChange([]) }}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              !enrolled
                ? 'bg-gray-300 text-gray-800 border-gray-300'
                : 'border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            No
          </button>
        </div>
      </div>

      {/* Campaign list (only if enrolled) */}
      {enrolled && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Select campaigns
          </p>
          {activeCampaigns.length === 0 && (
            <p className="text-xs text-gray-400 italic">
              No active campaigns available. Create a campaign first in Settings → Automations.
            </p>
          )}
          {activeCampaigns.map((campaign) => {
            const enrolledHere = isEnrolled(campaign.id)
            const assignment = assignments.find((a) => a.campaignId === campaign.id)
            const expanded = expandedCampaign === campaign.id
            return (
              <div
                key={campaign.id}
                className={`border rounded-lg overflow-hidden transition-colors ${
                  enrolledHere ? 'border-blue-300 bg-white' : 'border-gray-200 bg-white'
                }`}
              >
                {/* Campaign header with enroll toggle */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enrolledHere}
                      onChange={() => toggleCampaign(campaign.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-800">
                      {campaign.name}
                    </span>
                  </label>
                  {enrolledHere && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCampaign(expanded ? null : campaign.id)
                      }
                      className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      {expanded ? 'Collapse' : 'Configure'}
                    </button>
                  )}
                </div>

                {/* Per-campaign config */}
                {enrolledHere && expanded && assignment && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100 bg-gray-50">
                    {/* Existing Leads */}
                    <div className="pt-3">
                      <p className="text-xs text-gray-700 mb-2">
                        <strong>Existing Leads</strong> — Would you like to make{' '}
                        <strong>{prettyUser}</strong> the <strong>{prettyRole}</strong>{' '}
                        for existing unassigned leads in{' '}
                        <strong>{campaign.name}</strong>?
                      </p>
                      <YesNoButtons
                        value={assignment.backfillExistingLeads}
                        onChange={(v) =>
                          updateAssignment(campaign.id, { backfillExistingLeads: v })
                        }
                      />
                    </div>

                    {/* New Leads */}
                    <div>
                      <p className="text-xs text-gray-700 mb-2">
                        <strong>New Leads</strong> — Would you like to assign new
                        leads in <strong>{campaign.name}</strong> to{' '}
                        <strong>{prettyUser}</strong>?
                      </p>
                      <YesNoButtons
                        value={assignment.assignNewLeads}
                        onChange={(v) =>
                          updateAssignment(campaign.id, { assignNewLeads: v })
                        }
                      />
                    </div>

                    <p className="text-[10px] text-gray-400">
                      If more than one user is assigned to the same role + campaign,
                      new leads are distributed round-robin. Vacation mode pauses
                      auto-assignment.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function YesNoButtons({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
          value
            ? 'bg-blue-600 text-white border-blue-600'
            : 'border-gray-200 text-gray-600 hover:bg-gray-100'
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
          !value
            ? 'bg-gray-200 text-gray-700 border-gray-200'
            : 'border-gray-200 text-gray-600 hover:bg-gray-100'
        }`}
      >
        No
      </button>
    </div>
  )
}
