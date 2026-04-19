'use client'

/**
 * PhoneNumbersPanel
 *
 * Admin panel listing provider-synced phone numbers and their claim status
 * against Lead Campaigns. Opens CreateLeadCampaignWizard to claim an unclaimed
 * number.
 *
 * API:
 *   GET  /api/twilio-numbers          — list numbers
 *   POST /api/phone-numbers/sync      — re-sync from active provider
 *   GET  /api/lead-campaigns          — to resolve claim status
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Phone, RefreshCw, Plus, Loader2, Pencil } from 'lucide-react'
import { CreateLeadCampaignWizard } from './CreateLeadCampaignWizard'

type CampaignType = 'DTS' | 'DTA' | 'BUYER' | 'VENDOR'
type AssignmentMethod = 'ROUND_ROBIN' | 'FIRST_TO_CLAIM' | 'MANUAL'

interface ExistingCampaignForEdit {
  id: string
  name: string
  type: CampaignType
  leadSourceId: string | null
  assignmentMethod: AssignmentMethod
  roleToggles: Array<{ roleId: string; enabled: boolean }>
  assignedUserIds?: string[]
}

interface TwilioNumberRow {
  id: string
  number: string
  friendlyName: string | null
  providerName?: string | null
  lastSyncedAt?: string | null
}

interface LeadCampaignRow {
  id: string
  name: string
  type: 'DTS' | 'DTA' | 'BUYER' | 'VENDOR'
  isActive: boolean
  phoneNumber?: { number: string; friendlyName: string | null } | null
}

/**
 * Pretty-print an E.164 number as +1 (555) 123-4567 when possible, otherwise
 * return it unchanged.
 */
function formatNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (raw.startsWith('+1') && digits.length === 11) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

function formatSyncedAt(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const now = Date.now()
  const diffMin = Math.round((now - date.getTime()) / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return date.toLocaleDateString()
}

const CAMPAIGN_TYPE_BADGE: Record<LeadCampaignRow['type'], string> = {
  DTS: 'bg-purple-50 text-purple-700',
  DTA: 'bg-indigo-50 text-indigo-700',
  BUYER: 'bg-amber-50 text-amber-700',
  VENDOR: 'bg-teal-50 text-teal-700',
}

export function PhoneNumbersPanel() {
  const [numbers, setNumbers] = useState<TwilioNumberRow[]>([])
  const [campaigns, setCampaigns] = useState<LeadCampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [wizardFor, setWizardFor] = useState<TwilioNumberRow | null>(null)
  const [editingCampaign, setEditingCampaign] = useState<{
    phoneNumber: TwilioNumberRow
    campaign: ExistingCampaignForEdit
  } | null>(null)
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null)

  async function openEditCampaign(num: TwilioNumberRow, campaignId: string) {
    setLoadingEdit(campaignId)
    try {
      const res = await fetch(`/api/lead-campaigns/${campaignId}`)
      if (!res.ok) throw new Error('Failed to load campaign')
      const json = await res.json()
      const c = json.data ?? json
      setEditingCampaign({
        phoneNumber: num,
        campaign: {
          id: c.id,
          name: c.name,
          type: c.type,
          leadSourceId: c.leadSourceId ?? c.leadSource?.id ?? null,
          assignmentMethod: c.assignmentMethod ?? 'ROUND_ROBIN',
          roleToggles: (c.roleToggles ?? []).map((t: any) => ({
            roleId: t.roleId,
            enabled: t.enabled,
          })),
          assignedUserIds: (c.assignedUsers ?? []).map((a: any) => a.userId ?? a.user?.id).filter(Boolean),
        },
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open campaign editor')
    } finally {
      setLoadingEdit(null)
    }
  }

  const fetchData = useCallback(async () => {
    try {
      const [numRes, campRes] = await Promise.all([
        fetch('/api/twilio-numbers'),
        fetch('/api/lead-campaigns'),
      ])
      if (!numRes.ok) throw new Error('Failed to load numbers')
      if (!campRes.ok) throw new Error('Failed to load campaigns')
      const [numJson, campJson] = await Promise.all([numRes.json(), campRes.json()])
      setNumbers(numJson.data ?? [])
      setCampaigns(campJson.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load phone numbers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Index campaigns by phone number (for quick claim lookup).
  const campaignByNumber = useMemo(() => {
    const map = new Map<string, LeadCampaignRow>()
    for (const c of campaigns) {
      if (c.phoneNumber?.number) map.set(c.phoneNumber.number, c)
    }
    return map
  }, [campaigns])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/phone-numbers/sync', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error ?? 'Sync failed')
      }
      toast.success(`Synced ${json.count ?? 0} number${json.count === 1 ? '' : 's'} from ${json.providerName ?? 'provider'}`)
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Phone Numbers</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage phone numbers from your active communication provider.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {syncing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {syncing ? 'Syncing...' : 'Sync from Provider'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Number
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Friendly Name
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Last Synced
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Provider
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Status
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Lead Campaign
              </th>
              <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading...
                </td>
              </tr>
            ) : numbers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  <Phone className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-600">No phone numbers</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Click &quot;Sync from Provider&quot; to pull your numbers.
                  </p>
                </td>
              </tr>
            ) : (
              numbers.map((n) => {
                const campaign = campaignByNumber.get(n.number)
                const claimed = Boolean(campaign)
                return (
                  <tr key={n.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-gray-800">
                      {formatNumber(n.number)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{n.friendlyName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {formatSyncedAt(n.lastSyncedAt ?? null)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs capitalize">
                      {n.providerName ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          claimed
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {claimed ? 'Claimed' : 'Unclaimed'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {campaign ? (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-800">{campaign.name}</span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                              CAMPAIGN_TYPE_BADGE[campaign.type]
                            }`}
                          >
                            {campaign.type}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {claimed && campaign ? (
                        <button
                          onClick={() => openEditCampaign(n, campaign.id)}
                          disabled={loadingEdit === campaign.id}
                          className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {loadingEdit === campaign.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Pencil className="w-3 h-3" />
                          )}
                          Edit Campaign
                        </button>
                      ) : (
                        <button
                          onClick={() => setWizardFor(n)}
                          className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Create Campaign
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Wizard */}
      {wizardFor && (
        <CreateLeadCampaignWizard
          phoneNumber={{
            id: wizardFor.id,
            number: wizardFor.number,
            friendlyName: wizardFor.friendlyName,
          }}
          onClose={() => setWizardFor(null)}
          onCreated={() => {
            setWizardFor(null)
            fetchData()
          }}
        />
      )}

      {/* Edit Wizard */}
      {editingCampaign && (
        <CreateLeadCampaignWizard
          phoneNumber={{
            id: editingCampaign.phoneNumber.id,
            number: editingCampaign.phoneNumber.number,
            friendlyName: editingCampaign.phoneNumber.friendlyName,
          }}
          existingCampaign={editingCampaign.campaign}
          onClose={() => setEditingCampaign(null)}
          onCreated={() => {
            setEditingCampaign(null)
            fetchData()
          }}
        />
      )}
    </div>
  )
}
