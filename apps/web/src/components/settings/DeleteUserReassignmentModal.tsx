'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'

interface EligibleUser {
  id: string
  name: string
  email: string
}

interface CampaignBucket {
  campaignKey: string
  campaignName: string
  marketId: string | null
  marketName: string
  leadCount: number
  eligibleUsers: EligibleUser[]
  isOnlyAssignee: boolean
}

interface ReassignmentsResponse {
  leadsReassignment: CampaignBucket[]
  buyersReassignment: CampaignBucket[]
}

interface Selection {
  reassign: boolean
  userId: string | null
}

interface Props {
  userId: string
  userName: string
  onClose: () => void
  onDeleted: () => void
}

export function DeleteUserReassignmentModal({ userId, userName, onClose, onDeleted }: Props) {
  const [tab, setTab] = useState<'leads' | 'buyers'>('leads')
  const [data, setData] = useState<ReassignmentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // selection keyed by campaignKey
  const [leadsSel, setLeadsSel] = useState<Record<string, Selection>>({})
  const [buyersSel, setBuyersSel] = useState<Record<string, Selection>>({})

  // collapsed state per campaign
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    fetch(`/api/users/${userId}/reassignments`)
      .then((r) => r.json())
      .then((json: ReassignmentsResponse) => {
        if (cancelled) return
        setData(json)
        // Default: don't reassign
        const seedLeads: Record<string, Selection> = {}
        json.leadsReassignment.forEach((b) => { seedLeads[b.campaignKey] = { reassign: false, userId: null } })
        setLeadsSel(seedLeads)
        const seedBuyers: Record<string, Selection> = {}
        json.buyersReassignment.forEach((b) => { seedBuyers[b.campaignKey] = { reassign: false, userId: null } })
        setBuyersSel(seedBuyers)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
    return () => { cancelled = true }
  }, [userId])

  const buckets = data
    ? (tab === 'leads' ? data.leadsReassignment : data.buyersReassignment)
    : []
  const selections = tab === 'leads' ? leadsSel : buyersSel
  const setSelections = tab === 'leads' ? setLeadsSel : setBuyersSel

  // Group buckets by market
  const byMarket = new Map<string, CampaignBucket[]>()
  for (const b of buckets) {
    const key = b.marketName
    const list = byMarket.get(key) ?? []
    list.push(b)
    byMarket.set(key, list)
  }

  function updateSelection(key: string, patch: Partial<Selection>) {
    setSelections((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      const leads = data?.leadsReassignment.map((b) => ({
        campaignName: b.campaignName,
        marketId: b.marketId,
        reassignToUserId: leadsSel[b.campaignKey]?.reassign ? leadsSel[b.campaignKey].userId : null,
      })) ?? []
      const buyers = data?.buyersReassignment.map((b) => ({
        campaignName: b.campaignName,
        marketId: b.marketId,
        reassignToUserId: buyersSel[b.campaignKey]?.reassign ? buyersSel[b.campaignKey].userId : null,
      })) ?? []

      const res = await fetch(`/api/users/${userId}/delete-with-reassignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads, buyers }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to delete user')
      }
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setSaving(false)
    }
  }

  // Validation — any "reassign" selection must have a userId picked
  const invalidSelections = Object.values({ ...leadsSel, ...buyersSel }).some(
    (s) => s.reassign && !s.userId
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-red-600">Delete User — {userName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setTab('leads')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === 'leads' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Leads Reassignment
            </button>
            <button
              onClick={() => setTab('buyers')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === 'buyers' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Buyers Reassignment
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-gray-600 mb-4">
            You are removing <span className="font-semibold">{userName}</span>. Please select the reassignment of leads and tasks previously assigned.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : buckets.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No {tab === 'leads' ? 'lead' : 'buyer'} assignments to reassign.
            </p>
          ) : (
            [...byMarket.entries()].map(([marketName, list]) => (
              <div key={marketName} className="mb-6">
                <p className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-3">
                  {marketName}
                </p>
                <div className="space-y-3">
                  {list.map((bucket) => {
                    const sel = selections[bucket.campaignKey] ?? { reassign: false, userId: null }
                    const isCollapsed = collapsed[bucket.campaignKey]
                    return (
                      <div key={bucket.campaignKey} className="border border-gray-200 rounded-xl">
                        <button
                          onClick={() => toggleCollapsed(bucket.campaignKey)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="text-left">
                            <p className="text-sm font-semibold text-blue-700">{bucket.campaignName}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {bucket.leadCount} {bucket.leadCount === 1 ? 'lead' : 'leads'} assigned
                            </p>
                          </div>
                          {isCollapsed ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          )}
                        </button>

                        {!isCollapsed && (
                          <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`opt-${tab}-${bucket.campaignKey}`}
                                checked={!sel.reassign}
                                onChange={() => updateSelection(bucket.campaignKey, { reassign: false, userId: null })}
                                className="text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">
                                Do not reassign the leads or tasks to anyone.
                              </span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`opt-${tab}-${bucket.campaignKey}`}
                                checked={sel.reassign}
                                disabled={bucket.eligibleUsers.length === 0}
                                onChange={() => updateSelection(bucket.campaignKey, { reassign: true })}
                                className="text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                              />
                              <span className={`text-sm ${bucket.eligibleUsers.length === 0 ? 'text-gray-400' : 'text-gray-700'}`}>
                                Reassign the leads and tasks to another team member.
                              </span>
                            </label>

                            {sel.reassign && bucket.eligibleUsers.length > 0 && (
                              <div className="ml-6 mt-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Leads and Task Reassigned to
                                </label>
                                <select
                                  value={sel.userId ?? ''}
                                  onChange={(e) => updateSelection(bucket.campaignKey, { userId: e.target.value || null })}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">Select User</option>
                                  {bucket.eligibleUsers.map((u) => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {bucket.isOnlyAssignee && (
                              <div className="ml-6 mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <span>
                                  <span className="font-semibold">{userName}</span> is the only team member assigned in this campaign. The leads will be unassigned.
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={saving || invalidSelections || loading}
            className="flex-1 bg-red-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-red-700 disabled:opacity-50 transition-colors active:scale-95 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete User
          </button>
        </div>
      </div>
    </div>
  )
}
