'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Upload } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export function ImportListModal({ open, onClose }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ name: string; total: number; created: number; duped: number } | null>(null)
  const [error, setError] = useState('')

  function handleClose() {
    onClose()
    setName(''); setDescription(''); setFile(null); setResult(null); setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !name.trim()) return
    setImporting(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', name.trim())
      if (description.trim()) fd.append('description', description.trim())

      const res = await fetch('/api/list-stacking', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Import failed')
      }
      const data = await res.json()
      setResult({ name: data.name, total: data.total, created: data.created, duped: data.duped })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Import Lead List</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {result ? (
          <div className="p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
              <span className="text-2xl">✓</span>
            </div>
            <p className="font-semibold text-gray-900">{result.name}</p>
            <p className="text-sm text-gray-600">{result.total.toLocaleString()} records processed</p>
            <div className="flex gap-4 justify-center text-sm mt-1">
              <span className="text-green-600 font-medium">✓ {result.created} new</span>
              <span className="text-amber-600 font-medium">⟳ {result.duped} matched existing</span>
            </div>
            <button onClick={handleClose} className="mt-2 bg-blue-600 text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-blue-700 transition-colors active:scale-95">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">List Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Tax Delinquent Q2 2026" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional description" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">CSV File *</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 transition-colors">
                <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" id="csv-upload" required />
                <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-1.5">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">{file ? file.name : 'Click to select CSV'}</span>
                  <span className="text-[11px] text-gray-400">Columns: Address, City, State, Zip, First Name, Last Name, Phone, Email</span>
                </label>
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleClose}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={importing || !name.trim() || !file}
                className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors active:scale-95">
                {importing ? 'Importing…' : 'Import List'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
