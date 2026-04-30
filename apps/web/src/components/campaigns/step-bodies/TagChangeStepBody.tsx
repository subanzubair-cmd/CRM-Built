'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

/**
 * Tag step body — img036 in the spec. Two pill-input fields: one for
 * tags to ADD, one for tags to REMOVE. Comma or Enter creates a tag;
 * the spec's wording suggests at least one of the two should be
 * non-empty (we enforce that on save in the orchestrator).
 *
 * We pull the existing tag list from `/api/tags` so the user can pick
 * known tags by typing — but we also accept ad-hoc tag names since
 * the executor only mutates the property's `tags` string array.
 */

type Tag = { id: string; name: string }

type Config = {
  actionType: 'TAG_CHANGE'
  addTags: string[]
  removeTags: string[]
}

export function TagChangeStepBody({
  config,
  onChange,
}: {
  config: Config
  onChange: (next: Config) => void
}) {
  const [available, setAvailable] = useState<Tag[]>([])

  useEffect(() => {
    let aborted = false
    fetch('/api/tags?category=lead')
      .then((r) => r.json())
      .then((res) => {
        if (aborted) return
        const list = Array.isArray(res?.data) ? res.data : []
        setAvailable(list.map((t: any) => ({ id: t.id, name: t.name })))
      })
      .catch(() => {})
    return () => {
      aborted = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <PillInput
        label="Add these Tags"
        value={config.addTags}
        onChange={(next) => onChange({ ...config, addTags: next })}
        placeholder="Type tag name and press enter or comma to create a new tag."
        suggestions={available.map((t) => t.name)}
      />
      <PillInput
        label="Remove these Tags"
        value={config.removeTags}
        onChange={(next) => onChange({ ...config, removeTags: next })}
        placeholder="Type tag name and select from existing tags."
        suggestions={available.map((t) => t.name)}
      />
      <p className="text-[11px] text-gray-400">
        At least one of the two lists must be non-empty.
      </p>
    </div>
  )
}

function PillInput({
  label,
  value,
  onChange,
  placeholder,
  suggestions,
}: {
  label: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  suggestions: string[]
}) {
  const [draft, setDraft] = useState('')
  const lower = value.map((v) => v.toLowerCase())
  const matches =
    draft.trim().length > 0
      ? suggestions
          .filter(
            (s) =>
              s.toLowerCase().includes(draft.toLowerCase()) &&
              !lower.includes(s.toLowerCase()),
          )
          .slice(0, 6)
      : []

  function commit(next: string) {
    const t = next.trim()
    if (!t) return
    if (lower.includes(t.toLowerCase())) return
    onChange([...value, t])
    setDraft('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {label} <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-blue-500">
          {value.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[12px] font-medium rounded px-2 py-0.5"
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== t))}
                className="text-blue-400 hover:text-blue-700"
                aria-label={`Remove ${t}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => commit(draft)}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[140px] text-sm border-none focus:outline-none focus:ring-0 px-1 py-1"
          />
        </div>
        {matches.length > 0 && (
          <div className="absolute left-0 right-0 z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-md max-h-40 overflow-y-auto">
            {matches.map((m) => (
              <button
                key={m}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(m)
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700"
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
