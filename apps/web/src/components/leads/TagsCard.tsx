'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tag, X, Plus } from 'lucide-react'

interface Props {
  propertyId: string
  initialTags: string[] | null | undefined
}

export function TagsCard({ propertyId, initialTags }: Props) {
  const router = useRouter()
  const [tags, setTags] = useState<string[]>(initialTags ?? [])
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function saveTags(newTags: string[]) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })
      if (!res.ok) throw new Error('Failed to save tags')
      setTags(newTags)
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving tags')
    } finally {
      setSaving(false)
    }
  }

  async function addTag() {
    const tag = input.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag) { setAdding(false); setInput(''); return }
    if (tags.includes(tag)) { setInput(''); setAdding(false); return }
    await saveTags([...tags, tag])
    setInput('')
    setAdding(false)
  }

  async function removeTag(tag: string) {
    await saveTags(tags.filter((t) => t !== tag))
  }

  // Hide internal list-stacking tags from the chip UI
  const displayTags = tags.filter((t) => !t.startsWith('list:'))
  const internalCount = tags.length - displayTags.length

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">
            Tags
            {displayTags.length > 0 && (
              <span className="ml-1 text-gray-400 font-normal">({displayTags.length})</span>
            )}
          </h3>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Tag
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {displayTags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-0.5 rounded-full"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              disabled={saving}
              className="text-blue-400 hover:text-blue-700 disabled:opacity-40 ml-0.5"
              title={`Remove "${tag}"`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        {displayTags.length === 0 && !adding && (
          <p className="text-xs text-gray-400">No tags yet</p>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag()
              if (e.key === 'Escape') { setAdding(false); setInput('') }
            }}
            placeholder="Tag name…"
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={addTag}
            disabled={saving || !input.trim()}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50"
          >
            {saving ? '…' : 'Add'}
          </button>
          <button
            onClick={() => { setAdding(false); setInput('') }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}

      {internalCount > 0 && (
        <p className="text-[10px] text-gray-300 mt-2">
          + {internalCount} internal list-stacking tag{internalCount !== 1 ? 's' : ''} (hidden)
        </p>
      )}
    </div>
  )
}
