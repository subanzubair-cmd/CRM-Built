'use client'

/**
 * PhoneNumbersPanel
 *
 * Admin portal for every phone number provisioned across providers
 * (Twilio / Telnyx / SignalHouse). Shows KPI cards, full claim status against
 * Lead Campaigns, and 30-day SMS + call activity per number. Drill into
 * /settings/phone-numbers/[id] for the per-number activity feed.
 *
 * API:
 *   GET  /api/phone-numbers/stats     — enriched list + KPIs
 *   POST /api/phone-numbers/sync      — re-sync from active provider
 *   GET  /api/lead-campaigns/[id]     — to load existing campaign for editing
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Phone, RefreshCw, Plus, Loader2, Pencil, ExternalLink,
  CheckCircle2, AlertCircle, Inbox,
} from 'lucide-react'
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

interface PhoneNumberStats {
  smsIn: number
  smsOut: number
  callsIn: number
  callsOut: number
}

interface EnrichedNumber {
  id: string
  number: string
  friendlyName: string | null
  providerName: string | null
  lastSyncedAt: string | null
  isActive: boolean
  spamStatus: string | null
  tenDlcStatus: string | null
  purpose: string
  marketId: string | null
  campaign: { id: string; name: string; type: CampaignType } | null
  stats30d: PhoneNumberStats
}

interface KpiBundle {
  total: number
  assigned: number
  unassigned: number
  inactive: number
}

type FilterMode = 'all' | 'assigned' | 'unassigned' | 'inactive'

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

const CAMPAIGN_TYPE_BADGE: Record<CampaignType, string> = {
  DTS: 'bg-purple-50 text-purple-700',
  DTA: 'bg-indigo-50 text-indigo-700',
  BUYER: 'bg-amber-50 text-amber-700',
  VENDOR: 'bg-teal-50 text-teal-700',
}

const PROVIDER_BADGE: Record<string, string> = {
  twilio: 'bg-red-50 text-red-700',
  telnyx: 'bg-blue-50 text-blue-700',
  signalhouse: 'bg-emerald-50 text-emerald-700',
}

export function PhoneNumbersPanel() {
  const [numbers, setNumbers] = useState<EnrichedNumber[]>([])
  const [kpis, setKpis] = useState<KpiBundle>({ total: 0, assigned: 0, unassigned: 0, inactive: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [wizardFor, setWizardFor] = useState<EnrichedNumber | null>(null)
  const [editingCampaign, setEditingCampaign] = useState<{
    phoneNumber: EnrichedNumber
    campaign: ExistingCampaignForEdit
  } | null>(null)
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/phone-numbers/stats')
      if (!res.ok) throw new Error('Failed to load phone numbers')
      const json = await res.json()
      setNumbers(json.numbers ?? [])
      setKpis(json.kpis ?? { total: 0, assigned: 0, unassigned: 0, inactive: 0 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load phone numbers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function openEditCampaign(num: EnrichedNumber, campaignId: string) {
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

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/phone-numbers/sync', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error ?? 'Sync failed')
      }
      toast.success(
        `Synced ${json.count ?? 0} number${json.count === 1 ? '' : 's'} from ${json.providerName ?? 'provider'}`,
      )
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // ─── Apply filters ───
  const visible = numbers.filter((n) => {
    if (filter === 'assigned' && !n.campaign) return false
    if (filter === 'unassigned' && (n.campaign || !n.isActive)) return false
    if (filter === 'inactive' && n.isActive) return false
    if (providerFilter !== 'all' && (n.providerName ?? '') !== providerFilter) return false
    return true
  })

  const providers = Array.from(new Set(numbers.map((n) => n.providerName).filter(Boolean))) as string[]

  return (
    <div className="max-w-7xl space-y-4">
      {/* ── Header + sync ── */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Phone Numbers</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Every number across Twilio, Telnyx, and SignalHouse with their campaign linkage and 30-day activity.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {syncing ? 'Syncing…' : 'Sync from Provider'}
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Total numbers" value={kpis.total} icon={Phone} tone="neutral" onClick={() => setFilter('all')} active={filter === 'all'} />
        <KpiCard label="Assigned" value={kpis.assigned} icon={CheckCircle2} tone="green" onClick={() => setFilter('assigned')} active={filter === 'assigned'} />
        <KpiCard label="Unassigned" value={kpis.unassigned} icon={Inbox} tone="amber" onClick={() => setFilter('unassigned')} active={filter === 'unassigned'} />
        <KpiCard label="Inactive" value={kpis.inactive} icon={AlertCircle} tone="red" onClick={() => setFilter('inactive')} active={filter === 'inactive'} />
      </div>

      {/* ── Provider filter chips ── */}
      {providers.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Provider:</span>
          <button
            onClick={() => setProviderFilter('all')}
            className={`px-2 py-1 rounded-full transition-colors ${
              providerFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => setProviderFilter(p)}
              className={`px-2 py-1 rounded-full capitalize transition-colors ${
                providerFilter === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <Th>Number</Th>
              <Th>Friendly Name</Th>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Lead Campaign</Th>
              <Th className="text-right">SMS&nbsp;30d</Th>
              <Th className="text-right">Calls&nbsp;30d</Th>
              <Th>Last Synced</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  <Phone className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-600">
                    {numbers.length === 0 ? 'No phone numbers' : 'No numbers match the filter'}
                  </p>
                  {numbers.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Click &quot;Sync from Provider&quot; to pull your numbers.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              visible.map((n) => (
                <tr key={n.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-gray-800">
                    <Link
                      href={`/settings/phone-numbers/${n.id}`}
                      className="hover:text-blue-700 hover:underline transition-colors"
                    >
                      {formatNumber(n.number)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{n.friendlyName ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {n.providerName ? (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                          PROVIDER_BADGE[n.providerName] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {n.providerName}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {!n.isActive ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                        Inactive
                      </span>
                    ) : n.campaign ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                        Assigned
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        Unassigned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {n.campaign ? (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-800">{n.campaign.name}</span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                            CAMPAIGN_TYPE_BADGE[n.campaign.type]
                          }`}
                        >
                          {n.campaign.type}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">
                    <span className="text-emerald-600">↑ {n.stats30d.smsOut}</span>
                    <span className="text-gray-300 mx-1">/</span>
                    <span className="text-blue-600">↓ {n.stats30d.smsIn}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">
                    <span className="text-emerald-600">↑ {n.stats30d.callsOut}</span>
                    <span className="text-gray-300 mx-1">/</span>
                    <span className="text-blue-600">↓ {n.stats30d.callsIn}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{formatSyncedAt(n.lastSyncedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {n.campaign ? (
                        <button
                          onClick={() => openEditCampaign(n, n.campaign!.id)}
                          disabled={loadingEdit === n.campaign.id}
                          className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {loadingEdit === n.campaign.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Pencil className="w-3 h-3" />
                          )}
                          Edit
                        </button>
                      ) : (
                        <button
                          onClick={() => setWizardFor(n)}
                          className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Assign
                        </button>
                      )}
                      <Link
                        href={`/settings/phone-numbers/${n.id}`}
                        className="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded-lg transition-colors"
                        title="View activity"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
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

/* ───────────────────────────────────────────────────────────────────────── */

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide ${className ?? ''}`}
    >
      {children}
    </th>
  )
}

interface KpiCardProps {
  label: string
  value: number
  icon: typeof Phone
  tone: 'neutral' | 'green' | 'amber' | 'red'
  onClick: () => void
  active: boolean
}

function KpiCard({ label, value, icon: Icon, tone, onClick, active }: KpiCardProps) {
  const TONES: Record<KpiCardProps['tone'], { bg: string; text: string; iconBg: string; ring: string }> = {
    neutral: { bg: 'bg-white', text: 'text-gray-900', iconBg: 'bg-gray-100 text-gray-600', ring: 'ring-blue-500' },
    green: { bg: 'bg-white', text: 'text-emerald-600', iconBg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-500' },
    amber: { bg: 'bg-white', text: 'text-amber-600', iconBg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-500' },
    red: { bg: 'bg-white', text: 'text-red-600', iconBg: 'bg-red-50 text-red-600', ring: 'ring-red-500' },
  }
  const t = TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-4 ${t.bg} border border-gray-200 rounded-xl text-left hover:border-gray-300 transition-all ${
        active ? `ring-2 ${t.ring}` : ''
      }`}
    >
      <div className={`w-9 h-9 rounded-lg ${t.iconBg} flex items-center justify-center`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold ${t.text} leading-tight`}>{value}</p>
      </div>
    </button>
  )
}
