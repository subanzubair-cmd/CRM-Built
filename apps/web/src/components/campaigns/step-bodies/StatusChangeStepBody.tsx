'use client'

/**
 * Status-change body editor — img037..img039 in the spec.
 *
 * Status options are scoped by the campaign's module (single-select
 * radio at campaign level). Lead-side stages cover both DTS and DTA;
 * the executor will pick the correct column at apply time based on
 * the subject's leadType.
 *
 * The "what should happen to pending tasks?" dropdown is wired
 * directly to the `pendingTaskHandling` enum the executor reads.
 *
 * Per spec, this step's status change must NOT re-fire
 * StatusAutomation — the executor handles that suppression by
 * updating the property column directly instead of going through
 * the lead-PATCH path.
 */

type CampaignModule = 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD'

type Config = {
  actionType: 'STATUS_CHANGE'
  targetStatus: string
  pendingTaskHandling: 'COMPLETE_ALL' | 'KEEP_PENDING' | 'COMPLETE_MINE'
}

const STATUS_OPTIONS_BY_MODULE: Record<
  CampaignModule,
  Array<{ value: string; label: string }>
> = {
  LEADS: [
    { value: 'NEW_LEAD', label: 'New Lead' },
    { value: 'DISCOVERY', label: 'Discovery' },
    { value: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested — Add To Follow-up' },
    { value: 'VETTED_AGENTS', label: 'Vetted Agents' },
    { value: 'APPOINTMENT_MADE', label: 'Appointment Made' },
    { value: 'DUE_DILIGENCE', label: 'Due Diligence' },
    { value: 'OFFER_MADE', label: 'Offer Made' },
    { value: 'OFFER_FOLLOW_UP', label: 'Offer Follow-up' },
    { value: 'UNDER_CONTRACT', label: 'Under Contract' },
    { value: 'WARM', label: 'Warm Lead' },
    { value: 'REFERRED_TO_AGENT', label: 'Referred To Agent' },
    { value: 'DEAD', label: 'Dead Lead' },
  ],
  BUYERS: [
    { value: 'POTENTIAL_BUYER', label: 'Potential Buyer' },
    { value: 'COLD_BUYER', label: 'Cold Buyer' },
    { value: 'WARM_BUYER', label: 'Warm Buyer' },
    { value: 'HOT_BUYER', label: 'Hot Buyer' },
    { value: 'DISPO_OFFER_RECEIVED', label: 'Offer Received' },
    { value: 'SOLD', label: 'Sold' },
  ],
  VENDORS: [
    { value: 'NEW_CONTRACT', label: 'New Contract' },
    { value: 'MARKETING_TO_BUYERS', label: 'Marketing To Buyers' },
    { value: 'SHOWING_TO_BUYERS', label: 'Showing To Buyers' },
    { value: 'EVALUATING_OFFERS', label: 'Evaluating Offers' },
    { value: 'ACCEPTED_OFFER', label: 'Accepted Offer' },
    { value: 'CLEAR_TO_CLOSE', label: 'Clear To Close' },
  ],
  SOLD: [
    { value: 'NEW_INVENTORY', label: 'New Inventory' },
    { value: 'GETTING_ESTIMATES', label: 'Getting Estimates' },
    { value: 'UNDER_REHAB', label: 'Under Rehab' },
    { value: 'LISTED_FOR_SALE', label: 'Listed For Sale' },
    { value: 'UNDER_CONTRACT', label: 'Under Contract' },
  ],
}

const PENDING_HANDLING: Array<{
  value: Config['pendingTaskHandling']
  label: string
}> = [
  { value: 'COMPLETE_ALL', label: "Mark everyone's pending tasks as completed" },
  { value: 'KEEP_PENDING', label: 'Leave all pending tasks as pending' },
  { value: 'COMPLETE_MINE', label: 'Mark only my pending tasks as completed' },
]

export function StatusChangeStepBody({
  config,
  onChange,
  campaignModule,
}: {
  config: Config
  onChange: (next: Config) => void
  campaignModule: CampaignModule
}) {
  const options = STATUS_OPTIONS_BY_MODULE[campaignModule] ?? []

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          What status would you like to change the {moduleLabel(campaignModule)} to{' '}
          <span className="text-rose-500">*</span>
        </label>
        <select
          value={config.targetStatus}
          onChange={(e) => onChange({ ...config, targetStatus: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Select a status —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-gray-400">
          {moduleLabel(campaignModule, true)} moved through this drip
          step will not re-trigger the Status Automation feature for
          the new status — only this step applies.
        </p>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          What should happen to pending tasks in the old status?{' '}
          <span className="text-rose-500">*</span>
        </label>
        <select
          value={config.pendingTaskHandling}
          onChange={(e) =>
            onChange({
              ...config,
              pendingTaskHandling: e.target.value as Config['pendingTaskHandling'],
            })
          }
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PENDING_HANDLING.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function moduleLabel(m: CampaignModule, plural = false): string {
  switch (m) {
    case 'LEADS':
      return plural ? 'Leads' : 'lead'
    case 'BUYERS':
      return plural ? 'Buyers' : 'buyer'
    case 'VENDORS':
      return plural ? 'Vendors' : 'vendor'
    case 'SOLD':
      return plural ? 'Sold properties' : 'sold property'
  }
}
