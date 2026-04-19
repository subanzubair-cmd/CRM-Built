'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tag, Plus, Loader2, X, Pencil, Check } from 'lucide-react'

const TAG_TABS = [
  { key: 'lead', label: 'Lead Tags' },
  { key: 'buyer', label: 'Buyer Tags' },
  { key: 'task', label: 'Task Tags' },
] as const

type TagTab = (typeof TAG_TABS)[number]['key']

const PRESET_COLORS = [
  { hex: '#3B82F6', label: 'Blue' },
  { hex: '#EF4444', label: 'Red' },
  { hex: '#10B981', label: 'Green' },
  { hex: '#F59E0B', label: 'Yellow' },
  { hex: '#8B5CF6', label: 'Purple' },
  { hex: '#EC4899', label: 'Pink' },
] as const

interface TagRecord {
  id: string
  name: string
  color: string
  category: string
  createdAt: string
  updatedAt: string
}

export function TagsPanel() {
  const [activeTab, setActiveTab] = useState<TagTab>('lead')
  const [tags, setTags] = useState<TagRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<string>(PRESET_COLORS[0].hex)
  const [saving, setSaving] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchTags = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/tags')
      if (!res.ok) throw new Error('Failed to load tags')
      const json = await res.json()
      setTags(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags')
      setTags([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const filteredTags = tags.filter((t) => t.category === activeTab)

  async function handleCreate() {
    if (!newTagName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor, category: activeTab }),
      })
      if (res.status === 409) {
        const json = await res.json()
        setError(json.error)
        return
      }
      if (!res.ok) throw new Error('Failed to create tag')
      const json = await res.json()
      setTags((prev) => [...prev, json.data])
      setNewTagName('')
      setNewTagColor(PRESET_COLORS[0].hex)
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() || undefined, color: editColor || undefined }),
      })
      if (res.status === 409) {
        const json = await res.json()
        setError(json.error)
        return
      }
      if (!res.ok) throw new Error('Failed to update tag')
      const json = await res.json()
      setTags((prev) => prev.map((t) => (t.id === id ? json.data : t)))
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tag')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete tag')
      setTags((prev) => prev.filter((t) => t.id !== id))
      setDeletingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag')
    }
  }

  function startEdit(tag: TagRecord) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Tags</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            View and manage tags used across your leads, buyers, and tasks.
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm)
            setEditingId(null)
          }}
          className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Tag
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-xs text-red-600">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TAG_TABS.map((t) => {
          const count = tags.filter((tag) => tag.category === t.key).length
          return (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key)
                setEditingId(null)
                setDeletingId(null)
              }}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="bg-white border-2 border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Tag name"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.hex}
                  onClick={() => setNewTagColor(color.hex)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    newTagColor === color.hex ? 'border-gray-800 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color.hex }}
                  title={color.label}
                />
              ))}
            </div>
            <button
              onClick={handleCreate}
              disabled={saving || !newTagName.trim()}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false)
                setNewTagName('')
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            This tag will be added to the{' '}
            <span className="font-medium text-gray-600">
              {TAG_TABS.find((t) => t.key === activeTab)?.label}
            </span>{' '}
            category.
          </p>
        </div>
      )}

      {/* Tag grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading tags...
        </div>
      ) : filteredTags.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Tag className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">
            No {TAG_TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} yet
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Click &quot;+ Add Tag&quot; to create your first tag in this category.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex flex-wrap gap-2">
            {filteredTags.map((tag) => {
              const isEditing = editingId === tag.id
              const isDeleting = deletingId === tag.id

              if (isEditing) {
                return (
                  <div
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 border-2 border-blue-300 rounded-full px-2 py-1 bg-blue-50"
                  >
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdate(tag.id)}
                      className="text-sm w-24 bg-transparent border-none outline-none"
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color.hex}
                          onClick={() => setEditColor(color.hex)}
                          className={`w-4 h-4 rounded-full border ${
                            editColor === color.hex ? 'border-gray-800' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color.hex }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => handleUpdate(tag.id)}
                      disabled={saving}
                      className="text-blue-600 hover:text-blue-800 p-0.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              }

              if (isDeleting) {
                return (
                  <div
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 border-2 border-red-300 rounded-full px-3 py-1.5 bg-red-50"
                  >
                    <span className="text-xs text-red-700">Delete &quot;{tag.name}&quot;?</span>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="text-xs text-red-600 font-medium hover:text-red-800"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      No
                    </button>
                  </div>
                )
              }

              return (
                <span
                  key={tag.id}
                  className="group inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border cursor-pointer transition-all hover:shadow-sm"
                  style={{
                    backgroundColor: `${tag.color}10`,
                    borderColor: `${tag.color}40`,
                    color: tag.color,
                  }}
                  onClick={() => startEdit(tag)}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingId(tag.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all -mr-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            {filteredTags.length} tag{filteredTags.length !== 1 ? 's' : ''} in this category. Click
            a tag to edit, or hover and click X to delete.
          </p>
        </div>
      )}
    </div>
  )
}
