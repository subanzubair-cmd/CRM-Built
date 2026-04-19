'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Pagination } from '@/components/ui/Pagination'
import { formatElapsed, activityColorClass } from '@/lib/format-elapsed'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  DISCOVERY: 'Discovery',
  INTERESTED_ADD_TO_FOLLOW_UP: 'Follow Up',
  APPOINTMENT_MADE: 'Appointment',
  DUE_DILIGENCE: 'Due Diligence',
  OFFER_MADE: 'Offer Made',
  OFFER_FOLLOW_UP: 'Offer Follow Up',
  UNDER_CONTRACT: 'Under Contract',
}

const STAGE_COLORS: Record<string, string> = {
  NEW_LEAD: 'bg-gray-100 text-gray-700',
  DISCOVERY: 'bg-blue-100 text-blue-700',
  INTERESTED_ADD_TO_FOLLOW_UP: 'bg-yellow-100 text-yellow-800',
  APPOINTMENT_MADE: 'bg-purple-100 text-purple-700',
  DUE_DILIGENCE: 'bg-orange-100 text-orange-700',
  OFFER_MADE: 'bg-emerald-100 text-emerald-700',
  OFFER_FOLLOW_UP: 'bg-blue-100 text-blue-700',
  UNDER_CONTRACT: 'bg-green-100 text-green-800',
}

type SortKey =
  | 'address'
  | 'stage'
  | 'campaign'
  | 'lastComm'
  | 'source'
  | 'market'
  | 'arv'
  | 'askingPrice'
  | 'offers'
  | 'assigned'
  | 'tasks'

type SortOrder = 'asc' | 'desc'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPrice(n: number | null): string {
  if (n == null) return '\u2014'
  return n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`
}

function daysSince(date: Date | string | null | undefined): number | null {
  if (!date) return null
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LeadRow {
  id: string
  streetAddress: string | null
  city: string | null
  state: string | null
  activeLeadStage: string | null
  isHot: boolean
  source: string | null
  campaignName: string | null
  arv: number | null
  askingPrice: number | null
  updatedAt: Date
  lastActivityAt: Date | null
  createdAt: Date
  contacts: Array<{
    contact: { firstName: string; lastName: string | null; phone: string | null }
  }>
  assignedTo: { id: string; name: string } | null
  market: { id: string; name: string } | null
  _count: { tasks: number; offers: number }
}

interface Props {
  rows: LeadRow[]
  total: number
  pipeline: string
  page: number
  pageSize: number
  users: Array<{ id: string; name: string }>
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

interface Column {
  key: string
  label: string
  width: string
  align?: 'left' | 'right' | 'center'
  sortKey?: SortKey
}

const COLUMNS: Column[] = [
  { key: 'checkbox', label: '', width: '40px' },
  { key: 'seller', label: 'Seller Name', width: '140px' },
  { key: 'address', label: 'Property Address', width: '180px', sortKey: 'address' },
  { key: 'status', label: 'Status', width: '120px', sortKey: 'stage' },
  { key: 'campaign', label: 'Campaign', width: '130px', sortKey: 'campaign' },
  { key: 'lastComm', label: 'Last Comm', width: '120px', sortKey: 'lastComm' },
  { key: 'source', label: 'Source', width: '110px', sortKey: 'source' },
  { key: 'market', label: 'Market', width: '100px', sortKey: 'market' },
  { key: 'arv', label: 'ARV', width: '80px', align: 'right', sortKey: 'arv' },
  { key: 'askingPrice', label: 'Ask Price', width: '80px', align: 'right', sortKey: 'askingPrice' },
  { key: 'offers', label: 'Offers', width: '60px', align: 'center', sortKey: 'offers' },
  { key: 'assigned', label: 'Assigned', width: '100px', sortKey: 'assigned' },
  { key: 'tasks', label: 'Tasks', width: '60px', align: 'center', sortKey: 'tasks' },
]

/* ------------------------------------------------------------------ */
/*  Inline modals                                                      */
/* ------------------------------------------------------------------ */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function AddTagsModal({
  ids,
  onClose,
  onDone,
}: {
  ids: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    const tag = value.trim()
    if (!tag) return
    setLoading(true)
    try {
      await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'addTags', tags: [tag] }),
      })
      onDone()
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Add Tags" onClose={onClose}>
      <div className="flex gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Tag name..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={submit}
          disabled={loading || !value.trim()}
          className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : 'Add'}
        </button>
      </div>
    </ModalShell>
  )
}

function RemoveTagsModal({
  ids,
  onClose,
  onDone,
}: {
  ids: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [tags, setTags] = useState<string[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Fetch tags on mount
  useEffect(() => {
    fetch('/api/leads/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'getTags' }),
    })
      .then((r) => r.json())
      .then((data: { tags?: string[] }) => setTags(data.tags ?? []))
      .catch(() => setTags([]))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(tag: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  async function submit() {
    if (checked.size === 0) return
    setSubmitting(true)
    try {
      await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'removeTags', tags: [...checked] }),
      })
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Remove Tags" onClose={onClose}>
      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading tags...</p>
      ) : tags.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No tags found on selected leads.</p>
      ) : (
        <>
          <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
            {tags.map((tag) => (
              <label key={tag} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(tag)}
                  onChange={() => toggle(tag)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">{tag}</span>
              </label>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={submitting || checked.size === 0}
            className="w-full px-4 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '...' : `Remove ${checked.size} tag${checked.size !== 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </ModalShell>
  )
}

function AssignModal({
  ids,
  users,
  onClose,
  onDone,
}: {
  ids: string[]
  users: Array<{ id: string; name: string }>
  onClose: () => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function assign(userId: string) {
    setLoading(true)
    try {
      await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'assign', assignedToId: userId }),
      })
      onDone()
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Assign To" onClose={onClose}>
      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Assigning...</p>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => assign(u.id)}
              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
            >
              {u.name}
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

function DeleteModal({
  count,
  ids,
  onClose,
  onDone,
}: {
  count: number
  ids: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function confirm() {
    setLoading(true)
    try {
      await fetch('/api/leads/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      onDone()
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Delete Leads" onClose={onClose}>
      <p className="text-sm text-gray-600 mb-4">
        Delete {count} lead{count !== 1 ? 's' : ''}? This moves them to the Dead pipeline.
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={loading}
          className="px-4 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : 'Delete'}
        </button>
      </div>
    </ModalShell>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function LeadTable({ rows, total, pipeline, page, pageSize, users }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modal state
  const [modal, setModal] = useState<
    'addTags' | 'removeTags' | 'assign' | 'delete' | null
  >(null)

  // Current sort from URL
  const currentSort = searchParams.get('sort') as SortKey | null
  const currentOrder = searchParams.get('order') as SortOrder | null

  /* ---- Sort handler ---- */
  const handleSort = useCallback(
    (key: SortKey) => {
      const params = new URLSearchParams(searchParams.toString())
      if (currentSort !== key) {
        // New column: start with asc
        params.set('sort', key)
        params.set('order', 'asc')
      } else if (currentOrder === 'asc') {
        // Same column asc -> desc
        params.set('sort', key)
        params.set('order', 'desc')
      } else {
        // Same column desc -> clear
        params.delete('sort')
        params.delete('order')
      }
      params.delete('page')
      router.replace(`${pathname}?${params.toString()}`)
    },
    [searchParams, currentSort, currentOrder, pathname, router]
  )

  /* ---- Selection helpers ---- */
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someSelected = rows.some((r) => selectedIds.has(r.id))

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  /* ---- Bulk action done ---- */
  function onBulkDone() {
    setModal(null)
    clearSelection()
    router.refresh()
  }

  /* ---- Sort indicator ---- */
  function sortIndicator(key: SortKey) {
    if (currentSort !== key) return null
    return (
      <span className="ml-1 text-blue-600">
        {currentOrder === 'asc' ? '\u25B2' : '\u25BC'}
      </span>
    )
  }

  const selectedArray = [...selectedIds]

  /* ---- Empty state ---- */
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-48">
        <p className="text-sm text-gray-400">No leads found</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Lead count */}
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {total} lead{total !== 1 ? 's' : ''}
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-blue-700">
            {selectedIds.size} selected
          </span>

          <button
            onClick={() => setModal('addTags')}
            className="text-sm px-3 py-1.5 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            Add Tags
          </button>
          <button
            onClick={() => setModal('removeTags')}
            className="text-sm px-3 py-1.5 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            Remove Tags
          </button>
          <button
            onClick={() => setModal('assign')}
            className="text-sm px-3 py-1.5 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            Assign To
          </button>
          <a
            href={`/api/leads/export?pipeline=${pipeline}&ids=${selectedArray.join(',')}`}
            download
            className="text-sm px-3 py-1.5 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            Export
          </a>
          <button
            onClick={() => setModal('delete')}
            className="text-sm px-3 py-1.5 border border-red-300 rounded-lg bg-white text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>

          <button
            onClick={clearSelection}
            className="text-sm text-blue-600 hover:text-blue-800 underline ml-auto transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Scrollable table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '1200px' }}>
          <thead>
            <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
              {COLUMNS.map((col) => {
                const align =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'

                if (col.key === 'checkbox') {
                  return (
                    <th
                      key={col.key}
                      className="px-3 py-2.5"
                      style={{ width: col.width }}
                    >
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected && !allSelected
                        }}
                        onChange={toggleAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                  )
                }

                const sortable = !!col.sortKey

                return (
                  <th
                    key={col.key}
                    className={`${align} px-4 py-2.5 ${sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                    style={{ width: col.width }}
                    onClick={sortable ? () => handleSort(col.sortKey!) : undefined}
                  >
                    {col.label}
                    {col.sortKey && sortIndicator(col.sortKey)}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const primary = row.contacts[0]?.contact
              const sellerName = primary
                ? [primary.firstName, primary.lastName].filter(Boolean).join(' ')
                : '\u2014'
              const isSelected = selectedIds.has(row.id)
              const daysAgo = daysSince(row.lastActivityAt)
              const isStale = daysAgo === null || daysAgo > 7

              return (
                <tr
                  key={row.id}
                  onClick={(e) => {
                    // Don't navigate when clicking checkboxes or bulk elements
                    const target = e.target as HTMLElement
                    if (
                      target.closest('input[type="checkbox"]') ||
                      target.closest('[data-bulk]')
                    )
                      return
                    // Dead/warm/referred leads open via their original pipeline (dts/dta)
                    const targetPipeline = (pipeline === 'dead' || pipeline === 'warm' || pipeline === 'referred')
                      ? ((row as any).leadType === 'DIRECT_TO_AGENT' ? 'dta' : 'dts')
                      : pipeline
                    router.push(`/leads/${targetPipeline}/${row.id}`)
                  }}
                  className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  {/* 0 - Checkbox */}
                  <td className="px-3 py-3" style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(row.id)}
                      className="rounded border-gray-300"
                    />
                  </td>

                  {/* 1 - Seller Name */}
                  <td className="px-4 py-3" style={{ width: '140px' }}>
                    <span className="text-gray-900 font-medium">
                      {row.isHot && (
                        <span className="mr-1" title="Hot lead">
                          {'\uD83D\uDD25'}
                        </span>
                      )}
                      {sellerName}
                    </span>
                  </td>

                  {/* 2 - Property Address */}
                  <td className="px-4 py-3" style={{ width: '180px' }}>
                    <div>
                      <p className="text-gray-900">{row.streetAddress ?? '\u2014'}</p>
                      <p className="text-[11px] text-gray-400">
                        {[row.city, row.state, (row as any).zip].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </td>

                  {/* 3 - Status */}
                  <td className="px-4 py-3" style={{ width: '120px' }}>
                    {row.activeLeadStage ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          STAGE_COLORS[row.activeLeadStage] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {STAGE_LABELS[row.activeLeadStage] ?? row.activeLeadStage}
                      </span>
                    ) : (
                      '\u2014'
                    )}
                  </td>

                  {/* 4 - Campaign */}
                  <td className="px-4 py-3 text-gray-600" style={{ width: '130px' }}>
                    {row.campaignName ?? '\u2014'}
                  </td>

                  {/* 5 - Last Comm */}
                  <td className="px-4 py-3" style={{ width: '120px' }}>
                    {isStale ? (
                      <span className="text-xs font-medium text-red-500">
                        No contact {'\u2022'} {daysAgo ?? '?'}d
                      </span>
                    ) : (
                      <span
                        className={`text-xs font-medium ${activityColorClass(row.lastActivityAt)}`}
                      >
                        {formatElapsed(row.lastActivityAt)}
                      </span>
                    )}
                  </td>

                  {/* 6 - Source */}
                  <td className="px-4 py-3 text-gray-600" style={{ width: '110px' }}>
                    {row.source ?? '\u2014'}
                  </td>

                  {/* 7 - Market */}
                  <td className="px-4 py-3 text-gray-600" style={{ width: '100px' }}>
                    {row.market?.name ?? '\u2014'}
                  </td>

                  {/* 8 - ARV */}
                  <td
                    className="px-4 py-3 text-right text-gray-700 tabular-nums"
                    style={{ width: '80px' }}
                  >
                    {formatPrice(row.arv)}
                  </td>

                  {/* 9 - Ask Price */}
                  <td
                    className="px-4 py-3 text-right text-gray-700 tabular-nums"
                    style={{ width: '80px' }}
                  >
                    {formatPrice(row.askingPrice)}
                  </td>

                  {/* 10 - Offers */}
                  <td className="px-4 py-3 text-center" style={{ width: '60px' }}>
                    {row._count.offers > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium">
                        {row._count.offers}
                      </span>
                    ) : (
                      '\u2014'
                    )}
                  </td>

                  {/* 11 - Assigned */}
                  <td className="px-4 py-3" style={{ width: '100px' }}>
                    {row.assignedTo ? (
                      <span className="text-gray-600">{row.assignedTo.name}</span>
                    ) : (
                      <span className="text-gray-300">Unassigned</span>
                    )}
                  </td>

                  {/* 12 - Tasks */}
                  <td className="px-4 py-3 text-center" style={{ width: '60px' }}>
                    {row._count.tasks > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium">
                        {row._count.tasks}
                      </span>
                    ) : (
                      '\u2014'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Suspense>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Suspense>

      {/* Modals */}
      {modal === 'addTags' && (
        <AddTagsModal
          ids={selectedArray}
          onClose={() => setModal(null)}
          onDone={onBulkDone}
        />
      )}
      {modal === 'removeTags' && (
        <RemoveTagsModal
          ids={selectedArray}
          onClose={() => setModal(null)}
          onDone={onBulkDone}
        />
      )}
      {modal === 'assign' && (
        <AssignModal
          ids={selectedArray}
          users={users}
          onClose={() => setModal(null)}
          onDone={onBulkDone}
        />
      )}
      {modal === 'delete' && (
        <DeleteModal
          count={selectedIds.size}
          ids={selectedArray}
          onClose={() => setModal(null)}
          onDone={onBulkDone}
        />
      )}
    </div>
  )
}
