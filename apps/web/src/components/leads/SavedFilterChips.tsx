'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { X } from 'lucide-react'

interface SavedFilter {
  id: string
  name: string
  pipeline: string
  filters: Record<string, string>
}

interface Props {
  pipeline: string
}

export function SavedFilterChips({ pipeline }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [, startTransition] = useTransition()

  useEffect(() => {
    fetch(`/api/saved-filters?pipeline=${encodeURIComponent(pipeline)}`)
      .then((r) => r.json())
      .then((json) => setFilters(json.data ?? []))
      .catch(() => {})
  }, [pipeline])

  function applyFilter(f: SavedFilter) {
    const params = new URLSearchParams(f.filters)
    params.delete('page')
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  async function deleteFilter(id: string) {
    await fetch(`/api/saved-filters/${id}`, { method: 'DELETE' })
    setFilters((prev) => prev.filter((f) => f.id !== id))
  }

  if (filters.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-2">
      <span className="text-xs text-gray-400 mr-1">Saved:</span>
      {filters.map((f) => (
        <span
          key={f.id}
          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs"
        >
          <button
            onClick={() => applyFilter(f)}
            className="hover:text-blue-900 font-medium"
          >
            {f.name}
          </button>
          <button
            onClick={() => deleteFilter(f.id)}
            className="text-blue-400 hover:text-blue-700 transition-colors"
            title="Delete filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
