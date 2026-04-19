'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ListSource {
  id: string
  name: string
  description: string | null
  totalImported: number
  tags: string[]
  createdAt: Date | string
}

interface Props {
  sources: ListSource[]
}

export function ListSourceTable({ sources }: Props) {
  const router = useRouter()

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete list "${name}"? This does not delete any imported properties.`)) return
    await fetch(`/api/list-stacking/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  if (sources.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center h-40">
        <p className="text-sm text-gray-400">No lists imported yet — import your first list above.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {sources.length} list{sources.length !== 1 ? 's' : ''} imported
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {['List Name', 'Description', 'Imported', 'Created', ''].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sources.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
              <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{s.description ?? '—'}</td>
              <td className="px-4 py-3 text-gray-700 font-semibold">{s.totalImported.toLocaleString()}</td>
              <td className="px-4 py-3 text-gray-400 text-[11px]">
                {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
              </td>
              <td className="px-4 py-3">
                <button onClick={() => handleDelete(s.id, s.name)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
