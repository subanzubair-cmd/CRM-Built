'use client'

/**
 * Buyers Quick Filter — slide-in side panel matching the spec's
 * 3-tab UX:
 *
 *   Parameters (24+) ──> checkbox list of filterable fields
 *   Filter Values   ──> per-parameter operator + value picker
 *   Save & Configure ──> name + description + sharing + folder
 *
 * Parameters & their value types are declared up-front in PARAMS so
 * adding a new field is a single-array edit. Each value-type
 * (string / multi-enum / number-range / date-range / boolean) gets
 * a tiny inline editor.
 *
 * The panel emits a single `filter` JSONB blob on Apply — the same
 * shape the API consumes via `resolveBuyerRecipients` for bulk SMS
 * and via the saved-filter store for /api/saved-filters POST.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Search,
  CheckSquare,
  Loader2,
  ChevronDown,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Parameter catalogue ─────────────────────────────────────────────────────

type ValueType =
  | { kind: 'string' }
  | { kind: 'multi-enum'; options: Array<{ value: string; label: string }> }
  | { kind: 'multi-tag'; suggestionUrl?: string } // free-text multi-select
  | { kind: 'boolean' }
  | { kind: 'number-range' }
  | { kind: 'date-range' }
  | { kind: 'user-picker' }
  | { kind: 'campaign-picker' }

interface Param {
  id: string
  label: string
  category: 'Personal' | 'Geography' | 'Engagement' | 'Activity' | 'Custom'
  valueType: ValueType
}

const PARAMS: readonly Param[] = [
  // Personal
  { id: 'name', label: 'Name', category: 'Personal', valueType: { kind: 'string' } },
  { id: 'emailAddress', label: 'Email Address', category: 'Personal', valueType: { kind: 'string' } },
  { id: 'phoneNumber', label: 'Phone Number', category: 'Personal', valueType: { kind: 'string' } },
  {
    id: 'phoneNumberType',
    label: 'Phone Number Type',
    category: 'Personal',
    valueType: {
      kind: 'multi-enum',
      options: [
        { value: 'voip', label: 'Voip' },
        { value: 'landline', label: 'Landline' },
        { value: 'mobile', label: 'Mobile' },
        { value: 'tollfree', label: 'Toll-free' },
        { value: 'invalid', label: 'Invalid' },
      ],
    },
  },
  { id: 'vipBuyer', label: 'VIP Buyer', category: 'Personal', valueType: { kind: 'boolean' } },
  {
    id: 'contactType',
    label: 'Contact Type',
    category: 'Personal',
    valueType: {
      kind: 'multi-enum',
      options: [
        { value: 'BUYER', label: 'Buyer' },
        { value: 'AGENT', label: 'Agent' },
      ],
    },
  },
  { id: 'howHeardAbout', label: 'How Heard About Us', category: 'Personal', valueType: { kind: 'string' } },

  // Geography
  { id: 'targetCities', label: 'Target Cities', category: 'Geography', valueType: { kind: 'multi-tag', suggestionUrl: '/api/geography?kind=city' } },
  { id: 'targetStates', label: 'Target States', category: 'Geography', valueType: { kind: 'multi-tag', suggestionUrl: '/api/geography?kind=state' } },
  { id: 'targetZips', label: 'Target Zips', category: 'Geography', valueType: { kind: 'multi-tag', suggestionUrl: '/api/geography?kind=zip' } },
  { id: 'targetCounties', label: 'Target County', category: 'Geography', valueType: { kind: 'multi-tag', suggestionUrl: '/api/geography?kind=county' } },

  // Engagement
  { id: 'tags', label: 'Tags', category: 'Engagement', valueType: { kind: 'multi-tag' } },
  { id: 'emailCampaign', label: 'Email Campaign', category: 'Engagement', valueType: { kind: 'campaign-picker' } },
  { id: 'emailStats', label: 'Email Stats', category: 'Engagement', valueType: { kind: 'multi-enum', options: [
    { value: 'delivered', label: 'Delivered' },
    { value: 'opened', label: 'Opened' },
    { value: 'clicked', label: 'Clicked' },
    { value: 'bounced', label: 'Bounced' },
    { value: 'replied', label: 'Replied' },
  ] } },
  { id: 'smsCampaign', label: 'SMS Campaign', category: 'Engagement', valueType: { kind: 'campaign-picker' } },
  { id: 'smsStats', label: 'SMS Stats', category: 'Engagement', valueType: { kind: 'multi-enum', options: [
    { value: 'sent', label: 'Sent' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'failed', label: 'Failed' },
    { value: 'replied', label: 'Replied' },
  ] } },
  { id: 'buyerCustomQuestions', label: 'Buyer Custom Questions', category: 'Custom', valueType: { kind: 'string' } },

  // Activity
  { id: 'whoOwnsThisBuyer', label: 'Who Owns This Buyer', category: 'Activity', valueType: { kind: 'user-picker' } },
  { id: 'dateAdded', label: 'Date Added', category: 'Activity', valueType: { kind: 'date-range' } },
  { id: 'numberOfDeals', label: 'Number of Deals', category: 'Activity', valueType: { kind: 'number-range' } },
  { id: 'numberOfInquiries', label: 'Number of Inquiries', category: 'Activity', valueType: { kind: 'number-range' } },
  { id: 'numberOfOffers', label: 'Number of Offers', category: 'Activity', valueType: { kind: 'number-range' } },
  { id: 'numberOfOpenHousesAttended', label: 'Number of Open Houses Attended', category: 'Activity', valueType: { kind: 'number-range' } },
  { id: 'lastOutgoingTouch', label: 'Last Outgoing Touch', category: 'Activity', valueType: { kind: 'date-range' } },
  { id: 'lastIncomingTouch', label: 'Last Incoming Touch', category: 'Activity', valueType: { kind: 'date-range' } },
  { id: 'leadSource', label: 'Lead Source', category: 'Activity', valueType: { kind: 'string' } },
] as const

// ── Filter shape ────────────────────────────────────────────────────────────

export type FilterValue =
  | { op: 'is' | 'is-not' | 'contains'; value: string }
  | { op: 'in' | 'not-in'; values: string[] }
  | { op: 'eq'; value: boolean }
  | { op: 'between'; min: number | null; max: number | null }
  | { op: 'date-between'; from: string | null; to: string | null }

export interface QuickFilterState {
  enabled: string[] // parameter ids
  values: Record<string, FilterValue>
}

export interface SavedFilterRow {
  id: string
  name: string
  description: string | null
  folderId: string | null
  filters: QuickFilterState
}

// ── Component ───────────────────────────────────────────────────────────────

interface Folder {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  /** Pipeline name passed to the saved-filter / folder API. Default 'buyers'. */
  pipeline?: string
  /** Apply handler — receives the assembled filter JSONB ready to ship
   *  to /api/buyers/bulk-sms or used inline for the contacts table. */
  onApply: (filter: QuickFilterState) => void
  /** Optional initial state when re-editing a saved filter. */
  initial?: QuickFilterState
}

export function BuyerQuickFilter({
  open,
  onClose,
  pipeline = 'buyers',
  onApply,
  initial,
}: Props) {
  const [tab, setTab] = useState<'params' | 'values' | 'save'>('params')
  const [enabled, setEnabled] = useState<string[]>(initial?.enabled ?? [])
  const [values, setValues] = useState<Record<string, FilterValue>>(initial?.values ?? {})
  const [search, setSearch] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [folderId, setFolderId] = useState('')
  const [folders, setFolders] = useState<Folder[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setTab('params')
    setEnabled(initial?.enabled ?? [])
    setValues(initial?.values ?? {})
    setSearch('')
    setName('')
    setDescription('')
    setFolderId('')
    setSaveError(null)
    fetch(`/api/saved-filter-folders?pipeline=${pipeline}`)
      .then((r) => r.json())
      .then((res) => setFolders(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {})
  }, [open, initial, pipeline])

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map: Record<string, Param[]> = {}
    for (const p of PARAMS) {
      if (q && !p.label.toLowerCase().includes(q)) continue
      ;(map[p.category] ??= []).push(p)
    }
    return map
  }, [search])

  function toggleParam(id: string) {
    setEnabled((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
    setValues((prev) => {
      if (prev[id]) {
        // keep existing value when toggling off then on; if turning off, drop it
        if (enabled.includes(id)) {
          const next = { ...prev }
          delete next[id]
          return next
        }
      }
      return prev
    })
  }

  function setValue(id: string, v: FilterValue) {
    setValues((prev) => ({ ...prev, [id]: v }))
  }

  function applyFilter() {
    onApply({ enabled, values })
    onClose()
  }

  async function saveFilter() {
    if (!name.trim()) {
      setSaveError('Filter name is required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          pipeline,
          filters: { enabled, values },
          folderId: folderId || null,
          description: description.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : 'Save failed.')
      }
      toast.success('Filter saved.')
      // Apply right after save so the user sees the result immediately.
      onApply({ enabled, values })
      onClose()
    } catch (e: any) {
      setSaveError(e.message ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header tabs */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-gray-900">Quick Filter</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1 -mb-3">
            {([
              ['params', `Parameters (${PARAMS.length})`],
              ['values', 'Filter Values'],
              ['save', 'Save & Configure'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-t-lg border-b-2 transition-colors ${
                  tab === k
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'params' && (
            <ParamsTab
              search={search}
              setSearch={setSearch}
              grouped={grouped}
              enabled={enabled}
              toggle={toggleParam}
            />
          )}
          {tab === 'values' && (
            <ValuesTab
              enabled={enabled}
              values={values}
              setValue={setValue}
              removeValue={(id) =>
                setEnabled((p) => p.filter((x) => x !== id))
              }
            />
          )}
          {tab === 'save' && (
            <SaveTab
              name={name}
              description={description}
              folderId={folderId}
              folders={folders}
              setName={setName}
              setDescription={setDescription}
              setFolderId={setFolderId}
              error={saveError}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-400">
            {enabled.length} parameter{enabled.length === 1 ? '' : 's'} active
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEnabled([])
                setValues({})
              }}
              className="text-[12px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1.5"
              disabled={enabled.length === 0}
            >
              Reset
            </button>
            {tab === 'save' ? (
              <button
                type="button"
                onClick={saveFilter}
                disabled={saving}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save & Apply
              </button>
            ) : (
              <button
                type="button"
                onClick={applyFilter}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg px-3 py-1.5"
              >
                Apply Filter
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

// ── Subviews ────────────────────────────────────────────────────────────────

function ParamsTab({
  search,
  setSearch,
  grouped,
  enabled,
  toggle,
}: {
  search: string
  setSearch: (s: string) => void
  grouped: Record<string, Param[]>
  enabled: string[]
  toggle: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search filter values"
          className="w-full pl-7 pr-3 py-1.5 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {Object.keys(grouped).length === 0 ? (
        <p className="text-[12px] text-gray-400 italic">No parameters match your search.</p>
      ) : (
        Object.entries(grouped).map(([cat, params]) => (
          <div key={cat}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {cat}
            </p>
            <div className="space-y-1">
              {params.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={enabled.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[13px] text-gray-700">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function ValuesTab({
  enabled,
  values,
  setValue,
  removeValue,
}: {
  enabled: string[]
  values: Record<string, FilterValue>
  setValue: (id: string, v: FilterValue) => void
  removeValue: (id: string) => void
}) {
  if (enabled.length === 0) {
    return (
      <p className="text-[12px] text-gray-400 italic">
        Select parameters in the Parameters tab to set filter values.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {enabled.map((id) => {
        const param = PARAMS.find((p) => p.id === id)
        if (!param) return null
        return (
          <div key={id} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-semibold text-gray-700">{param.label}</p>
              <button
                type="button"
                onClick={() => removeValue(id)}
                className="text-gray-400 hover:text-red-500"
                aria-label="Remove parameter"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <ValueEditor param={param} value={values[id]} onChange={(v) => setValue(id, v)} />
          </div>
        )
      })}
    </div>
  )
}

function ValueEditor({
  param,
  value,
  onChange,
}: {
  param: Param
  value: FilterValue | undefined
  onChange: (v: FilterValue) => void
}) {
  const t = param.valueType
  if (t.kind === 'string') {
    const v = (value && 'value' in value ? (value as any).value : '') as string
    const op = (value && 'op' in value ? (value as any).op : 'is') as 'is' | 'is-not' | 'contains'
    return (
      <div className="flex items-center gap-2">
        <select
          value={op}
          onChange={(e) => onChange({ op: e.target.value as any, value: v })}
          className="border border-gray-200 rounded px-2 py-1 text-[12px] bg-white"
        >
          <option value="is">Is</option>
          <option value="is-not">Is Not</option>
          <option value="contains">Contains</option>
        </select>
        <input
          value={v}
          onChange={(e) => onChange({ op, value: e.target.value })}
          placeholder="Type a value…"
          className="flex-1 border border-gray-200 rounded px-2 py-1 text-[12px] bg-white"
        />
      </div>
    )
  }
  if (t.kind === 'multi-enum') {
    const cur = (value && 'values' in value ? value.values : []) as string[]
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {t.options.map((o) => {
          const checked = cur.includes(o.value)
          return (
            <label key={o.value} className="flex items-center gap-1.5 text-[12px] text-gray-700">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = checked ? cur.filter((v) => v !== o.value) : [...cur, o.value]
                  onChange({ op: 'in', values: next })
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {o.label}
            </label>
          )
        })}
      </div>
    )
  }
  if (t.kind === 'multi-tag') {
    return (
      <MultiTagInput
        values={(value && 'values' in value ? value.values : []) as string[]}
        suggestionUrl={t.suggestionUrl}
        onChange={(v) => onChange({ op: 'in', values: v })}
      />
    )
  }
  if (t.kind === 'boolean') {
    const v = !!(value && 'value' in value && (value as any).value)
    return (
      <label className="flex items-center gap-2 text-[12px] text-gray-700">
        <input
          type="checkbox"
          checked={v}
          onChange={(e) => onChange({ op: 'eq', value: e.target.checked })}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Yes
      </label>
    )
  }
  if (t.kind === 'number-range') {
    const min = value && 'min' in value ? (value as any).min : null
    const max = value && 'max' in value ? (value as any).max : null
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={min ?? ''}
          onChange={(e) => onChange({ op: 'between', min: e.target.value === '' ? null : Number(e.target.value), max })}
          placeholder="Min"
          className="w-24 border border-gray-200 rounded px-2 py-1 text-[12px]"
        />
        <span className="text-[11px] text-gray-400">to</span>
        <input
          type="number"
          value={max ?? ''}
          onChange={(e) => onChange({ op: 'between', min, max: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="Max"
          className="w-24 border border-gray-200 rounded px-2 py-1 text-[12px]"
        />
      </div>
    )
  }
  if (t.kind === 'date-range') {
    const from = value && 'from' in value ? (value as any).from : null
    const to = value && 'to' in value ? (value as any).to : null
    return (
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={from ?? ''}
          onChange={(e) => onChange({ op: 'date-between', from: e.target.value || null, to })}
          className="border border-gray-200 rounded px-2 py-1 text-[12px]"
        />
        <span className="text-[11px] text-gray-400">to</span>
        <input
          type="date"
          value={to ?? ''}
          onChange={(e) => onChange({ op: 'date-between', from, to: e.target.value || null })}
          className="border border-gray-200 rounded px-2 py-1 text-[12px]"
        />
      </div>
    )
  }
  if (t.kind === 'user-picker') {
    return (
      <UserPicker
        value={(value && 'value' in value ? (value as any).value : '') as string}
        onChange={(v) => onChange({ op: 'is', value: v })}
      />
    )
  }
  if (t.kind === 'campaign-picker') {
    return (
      <CampaignPicker
        value={(value && 'value' in value ? (value as any).value : '') as string}
        onChange={(v) => onChange({ op: 'is', value: v })}
      />
    )
  }
  return null
}

function MultiTagInput({
  values,
  suggestionUrl,
  onChange,
}: {
  values: string[]
  suggestionUrl?: string
  onChange: (v: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!suggestionUrl || !draft.trim()) {
      setSuggestions([])
      return
    }
    const ctrl = new AbortController()
    fetch(`${suggestionUrl}&q=${encodeURIComponent(draft)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((res) =>
        setSuggestions((Array.isArray(res?.values) ? res.values : []).filter((v: string) => !values.includes(v))),
      )
      .catch(() => {})
    return () => ctrl.abort()
  }, [draft, suggestionUrl, values])

  function commit(v: string) {
    const t = v.trim()
    if (!t || values.includes(t)) return
    onChange([...values, t])
    setDraft('')
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 border border-gray-200 rounded px-1.5 py-1 bg-white">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[11px] font-medium rounded px-1.5 py-0.5">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-blue-400 hover:text-blue-700">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit(draft)
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={values.length === 0 ? 'Type and press Enter…' : ''}
          className="flex-1 min-w-[80px] text-[12px] bg-white border-none focus:outline-none focus:ring-0 px-1"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-md max-h-40 overflow-y-auto">
          {suggestions.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                commit(s)
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-blue-50 hover:text-blue-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UserPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    fetch('/api/users?withDispositionRole=true')
      .then((r) => r.json())
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : []
        setUsers(list.map((u: any) => ({ id: u.id, name: u.name })))
      })
      .catch(() => {})
  }, [])
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] bg-white"
    >
      <option value="">— Select assignee —</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  )
}

function CampaignPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [list, setList] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    fetch('/api/buyers/bulk-sms')
      .then((r) => r.json())
      .then((res) => {
        const rows = Array.isArray(res?.rows) ? res.rows : []
        setList(rows.map((r: any) => ({ id: r.id, name: r.name })))
      })
      .catch(() => {})
  }, [])
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] bg-white"
    >
      <option value="">— Pick a campaign —</option>
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function SaveTab({
  name,
  description,
  folderId,
  folders,
  setName,
  setDescription,
  setFolderId,
  error,
}: {
  name: string
  description: string
  folderId: string
  folders: Folder[]
  setName: (v: string) => void
  setDescription: (v: string) => void
  setFolderId: (v: string) => void
  error: string | null
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Filter Name <span className="text-rose-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Houston VIP buyers"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional notes for teammates"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Save into folder
        </label>
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
        >
          <option value="">Save as Individual Filter</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-[12px] text-rose-600">{error}</p>}
      <p className="text-[11px] text-gray-400">
        Sharing controls are managed from the Manage Filters modal after saving.
      </p>
    </div>
  )
}
