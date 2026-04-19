'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { Bookmark, Download } from 'lucide-react'

const STAGE_OPTIONS = [
  { value: '', label: 'All Stages' },
  { value: 'NEW_LEAD', label: 'New Lead' },
  { value: 'DISCOVERY', label: 'Discovery' },
  { value: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Follow Up' },
  { value: 'APPOINTMENT_MADE', label: 'Appointment' },
  { value: 'DUE_DILIGENCE', label: 'Due Diligence' },
  { value: 'OFFER_MADE', label: 'Offer Made' },
  { value: 'OFFER_FOLLOW_UP', label: 'Offer Follow Up' },
  { value: 'UNDER_CONTRACT', label: 'Under Contract' },
]

interface Props {
  users: Array<{ id: string; name: string }>
  pipeline?: string
  showStageFilter?: boolean
  showHotFilter?: boolean
}

export function LeadFilters({ users, pipeline, showStageFilter = true, showHotFilter = false }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saving, setSaving] = useState(false)

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  const isHotActive = searchParams.get('isHot') === '1'

  async function saveFilter() {
    if (!saveName.trim() || !pipeline) return
    setSaving(true)
    try {
      const filters: Record<string, string> = {}
      searchParams.forEach((v, k) => { filters[k] = v })
      await fetch('/api/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim(), pipeline, filters }),
      })
      setSaveName('')
      setShowSaveInput(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <input
        placeholder="Search address or contact..."
        defaultValue={searchParams.get('search') ?? ''}
        onChange={(e) => {
          const val = e.target.value
          clearTimeout((window as any)._searchDebounce)
          ;(window as any)._searchDebounce = setTimeout(() => updateParam('search', val), 300)
        }}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {showStageFilter && (
        <select
          defaultValue={searchParams.get('stage') ?? ''}
          onChange={(e) => updateParam('stage', e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STAGE_OPTIONS.map((o) => (
            <option key={o.value || '__all'} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      <select
        defaultValue={searchParams.get('assignedToId') ?? ''}
        onChange={(e) => updateParam('assignedToId', e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Users</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>

      {showHotFilter && (
        <button
          onClick={() => updateParam('isHot', isHotActive ? '' : '1')}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm h-8 rounded-lg border transition-colors ${
            isHotActive
              ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          🔥 Hot Only
        </button>
      )}

      {pipeline && (
        <a
          href={`/api/leads/export?pipeline=${pipeline}&${searchParams.toString()}`}
          download
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs h-8 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          title="Export to CSV"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </a>
      )}

      {pipeline && !showSaveInput && (
        <button
          onClick={() => setShowSaveInput(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs h-8 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          title="Save current filter"
        >
          <Bookmark className="w-3.5 h-3.5" />
          Save
        </button>
      )}

      {pipeline && showSaveInput && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveFilter()
              if (e.key === 'Escape') { setShowSaveInput(false); setSaveName('') }
            }}
            placeholder="Filter name..."
            className="border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs h-8 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={saveFilter}
            disabled={saving || !saveName.trim()}
            className="px-2.5 py-1.5 text-xs h-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '...' : 'Save'}
          </button>
          <button
            onClick={() => { setShowSaveInput(false); setSaveName('') }}
            className="px-2 py-1.5 text-xs h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
