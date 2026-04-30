'use client'

/**
 * Manage Filters modal — folder CRUD + per-filter actions.
 *
 * Mirrors the spec's "Manage Filters" panel: folders on the left,
 * filters under each (drag-to-reorder deferred), action buttons for
 * Edit Folder / Delete Folder / Move filter / Delete filter, plus
 * an "Add New Folder" affordance.
 *
 * Sharing is managed inline per-filter: a small popover lets you
 * pick teammates and assign View / Edit. The popover writes through
 * /api/saved-filters/[id]/shares.
 */

import { useEffect, useState } from 'react'
import {
  X,
  Folder as FolderIcon,
  FilePlus,
  Pencil,
  Trash2,
  Plus,
  Share2,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

interface SavedFilter {
  id: string
  userId: string
  name: string
  description: string | null
  pipeline: string
  folderId: string | null
  filters: Record<string, unknown>
  shared: boolean
}
interface Folder {
  id: string
  name: string
  pipeline: string
}

interface Props {
  open: boolean
  onClose: () => void
  pipeline?: string
  /** Called when the user picks a saved filter to apply to the table. */
  onApply?: (filter: SavedFilter) => void
}

export function ManageFiltersModal({
  open,
  onClose,
  pipeline = 'buyers',
  onApply,
}: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (!open) return
    refresh()
  }, [open, pipeline])

  async function refresh() {
    setLoading(true)
    try {
      const [fRes, sRes] = await Promise.all([
        fetch(`/api/saved-filter-folders?pipeline=${pipeline}`).then((r) => r.json()),
        fetch(`/api/saved-filters?pipeline=${pipeline}`).then((r) => r.json()),
      ])
      setFolders(Array.isArray(fRes?.data) ? fRes.data : [])
      setFilters(Array.isArray(sRes?.data) ? sRes.data : [])
    } finally {
      setLoading(false)
    }
  }

  async function addFolder() {
    if (!newFolderName.trim()) return
    try {
      const res = await fetch('/api/saved-filter-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), pipeline }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : 'Failed.')
      }
      toast.success('Folder added.')
      setNewFolderName('')
      setShowFolderInput(false)
      refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Failed.')
    }
  }

  async function renameFolder(id: string) {
    if (!renameValue.trim()) {
      setRenamingFolder(null)
      return
    }
    try {
      await fetch(`/api/saved-filter-folders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      })
      toast.success('Folder renamed.')
      setRenamingFolder(null)
      refresh()
    } catch {
      toast.error('Rename failed.')
    }
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}"? Filters inside will move to Individual Filters.`))
      return
    setBusyId(id)
    try {
      await fetch(`/api/saved-filter-folders/${id}`, { method: 'DELETE' })
      toast.success('Folder deleted.')
      refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function deleteFilter(id: string, name: string) {
    if (!confirm(`Delete filter "${name}"?`)) return
    setBusyId(id)
    try {
      await fetch(`/api/saved-filters/${id}`, { method: 'DELETE' })
      toast.success('Filter deleted.')
      refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function moveFilter(filterId: string, folderId: string | null) {
    try {
      await fetch(`/api/saved-filters/${filterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      })
      refresh()
    } catch {
      toast.error('Move failed.')
    }
  }

  if (!open) return null

  const individualFilters = filters.filter((f) => !f.folderId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Manage Filters</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Organise saved filters into folders, share with teammates, or delete.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <p className="text-[12px] text-gray-400 italic">Loading…</p>
          )}

          {!loading && folders.length === 0 && filters.length === 0 && (
            <p className="text-[13px] text-gray-500">
              No filters yet. Use Quick Filter → Save & Configure to create your first filter.
            </p>
          )}

          {/* Folders + their nested filters */}
          {folders.map((folder) => {
            const inFolder = filters.filter((f) => f.folderId === folder.id)
            const renaming = renamingFolder === folder.id
            return (
              <div key={folder.id} className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    {renaming ? (
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameFolder(folder.id)
                          if (e.key === 'Escape') setRenamingFolder(null)
                        }}
                        autoFocus
                        className="text-[13px] font-semibold text-gray-800 border border-gray-200 rounded px-2 py-0.5"
                      />
                    ) : (
                      <span className="text-[13px] font-semibold text-gray-800 truncate">
                        {folder.name}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400">({inFolder.length})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingFolder(folder.id)
                        setRenameValue(folder.name)
                      }}
                      className="text-gray-400 hover:text-blue-600 p-1"
                      title="Edit folder"
                      aria-label="Edit folder"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFolder(folder.id, folder.name)}
                      disabled={busyId === folder.id}
                      className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-50"
                      title="Delete folder"
                      aria-label="Delete folder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {inFolder.length === 0 && (
                    <p className="px-4 py-2 text-[11px] text-gray-400 italic">
                      Empty folder.
                    </p>
                  )}
                  {inFolder.map((f) => (
                    <FilterRow
                      key={f.id}
                      filter={f}
                      folders={folders}
                      onApply={onApply}
                      onMove={moveFilter}
                      onDelete={deleteFilter}
                      busy={busyId === f.id}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Individual (no-folder) filters */}
          {individualFilters.length > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="bg-gray-50/60 px-3 py-2">
                <span className="text-[13px] font-semibold text-gray-800">
                  Individual Filters
                </span>
                <span className="ml-1.5 text-[11px] text-gray-400">
                  ({individualFilters.length})
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {individualFilters.map((f) => (
                  <FilterRow
                    key={f.id}
                    filter={f}
                    folders={folders}
                    onApply={onApply}
                    onMove={moveFilter}
                    onDelete={deleteFilter}
                    busy={busyId === f.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add new folder */}
          <div className="pt-2">
            {showFolderInput ? (
              <div className="flex items-center gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addFolder()
                    if (e.key === 'Escape') {
                      setShowFolderInput(false)
                      setNewFolderName('')
                    }
                  }}
                  autoFocus
                  placeholder="Folder name"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={addFolder}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold rounded-lg px-3 py-2"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowFolderInput(false)
                    setNewFolderName('')
                  }}
                  className="text-[12px] text-gray-500 hover:text-gray-800 px-2 py-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowFolderInput(true)}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Folder
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterRow({
  filter,
  folders,
  onApply,
  onMove,
  onDelete,
  busy,
}: {
  filter: SavedFilter
  folders: Folder[]
  onApply?: (f: SavedFilter) => void
  onMove: (filterId: string, folderId: string | null) => void
  onDelete: (id: string, name: string) => void
  busy: boolean
}) {
  const [shareOpen, setShareOpen] = useState(false)
  return (
    <div className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50">
      <button
        type="button"
        onClick={() => onApply?.(filter)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
          <span className="text-[13px] font-medium text-gray-800 truncate">
            {filter.name}
          </span>
          {filter.shared && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-700 uppercase">
              Shared
            </span>
          )}
        </div>
        {filter.description && (
          <p className="text-[11px] text-gray-400 truncate ml-4">
            {filter.description}
          </p>
        )}
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        <select
          value={filter.folderId ?? ''}
          onChange={(e) => onMove(filter.id, e.target.value || null)}
          className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white"
          title="Move to folder"
        >
          <option value="">Individual</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShareOpen((v) => !v)}
          className="text-gray-400 hover:text-blue-600 p-1"
          title="Manage sharing"
          aria-label="Manage sharing"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(filter.id, filter.name)}
          disabled={busy}
          className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-50"
          title="Delete filter"
          aria-label="Delete filter"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {shareOpen && (
        <SharePopover filterId={filter.id} onClose={() => setShareOpen(false)} />
      )}
    </div>
  )
}

function SharePopover({
  filterId,
  onClose,
}: {
  filterId: string
  onClose: () => void
}) {
  const [users, setUsers] = useState<
    Array<{ id: string; name: string; level: 'NONE' | 'VIEW' | 'EDIT' }>
  >([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then((r) => r.json()),
      fetch(`/api/saved-filters/${filterId}/shares`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .catch(() => ({ data: [] })),
    ])
      .then(([usersRes, sharesRes]) => {
        const userList = Array.isArray(usersRes) ? usersRes : []
        const shareMap = new Map<string, 'NONE' | 'VIEW' | 'EDIT'>()
        for (const s of (sharesRes?.data ?? []) as Array<any>) {
          shareMap.set(s.userId, s.level)
        }
        setUsers(
          userList.map((u: any) => ({
            id: u.id,
            name: u.name,
            level: shareMap.get(u.id) ?? 'NONE',
          })),
        )
      })
      .finally(() => setLoading(false))
  }, [filterId])

  async function setLevel(userId: string, level: 'NONE' | 'VIEW' | 'EDIT') {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, level } : u)))
    try {
      await fetch(`/api/saved-filters/${filterId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, level }),
      })
    } catch {
      toast.error('Sharing update failed.')
    }
  }

  return (
    <div className="absolute right-4 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-80 max-h-80 overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-gray-700">Share filter</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {loading ? (
        <p className="px-3 py-2 text-[11px] text-gray-400 italic">Loading…</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {users.map((u) => (
            <div key={u.id} className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[12px] text-gray-700 truncate">{u.name}</span>
              <div className="flex items-center gap-1 text-[11px]">
                {(['NONE', 'VIEW', 'EDIT'] as const).map((lvl) => (
                  <label
                    key={lvl}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      u.level === lvl
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={u.level === lvl}
                      onChange={() => setLevel(u.id, lvl)}
                      className="hidden"
                    />
                    {lvl === 'NONE' ? 'None' : lvl === 'VIEW' ? 'View' : 'Edit'}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
