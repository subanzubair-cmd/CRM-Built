'use client'

import { useEffect, useState } from 'react'

/**
 * Drip-enroll body editor — the action that enrolls the subject into
 * another drip campaign. We filter the picker to campaigns of the
 * same module so semantics line up (you can't enroll a Vendor row
 * into a LEADS-module drip), and exclude self to avoid an obvious
 * cycle. Cross-campaign cycles are still possible — accepted, since
 * detecting them is a graph walk and the customer can always pause
 * a runaway campaign.
 */

type CampaignModule = 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD'

type Config = {
  actionType: 'DRIP_ENROLL'
  targetCampaignId: string
}

type CampaignSummary = {
  id: string
  name: string
  status: string
  module: string
}

export function DripEnrollStepBody({
  config,
  onChange,
  campaignId,
  campaignModule,
}: {
  config: Config
  onChange: (next: Config) => void
  campaignId: string
  campaignModule: CampaignModule
}) {
  const [candidates, setCandidates] = useState<CampaignSummary[]>([])

  useEffect(() => {
    let aborted = false
    fetch(`/api/campaigns?type=DRIP&status=ACTIVE&module=${campaignModule}`)
      .then((r) => r.json())
      .then((res) => {
        if (aborted) return
        const list = Array.isArray(res?.rows)
          ? res.rows
          : Array.isArray(res?.data)
            ? res.data
            : []
        setCandidates(
          list
            .filter((c: any) => c.id !== campaignId)
            .map((c: any) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              module: c.module,
            })),
        )
      })
      .catch(() => {})
    return () => {
      aborted = true
    }
  }, [campaignId, campaignModule])

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        Drip Campaign
      </label>
      <select
        value={config.targetCampaignId}
        onChange={(e) =>
          onChange({ ...config, targetCampaignId: e.target.value })
        }
        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— Choose a drip campaign —</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-gray-400">
        Only ACTIVE drip campaigns of the same module ({campaignModule.toLowerCase()})
        are listed. Self-enrollment is blocked to avoid an obvious cycle.
      </p>
    </div>
  )
}
