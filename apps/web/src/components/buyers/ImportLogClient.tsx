'use client'

/**
 * Buyers Import Log tab — list of past CSV imports + an "+ Import
 * Buyers" button that opens a small upload modal. Once submitted,
 * the row appears here with QUEUED / PROCESSING / COMPLETED /
 * FAILED status; refresh to poll. Auto-poll could be added later
 * but the import worker is fast enough on small files that a
 * router.refresh() on close is enough for v1.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

interface ImportRow {
  id: string
  fileName: string
  fileSize: number
  totalRows: number
  processedRows: number
  failedRows: number
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  errorMessage: string | null
  createdAt: string | Date
  completedAt: string | Date | null
}

const STATUS_BADGE: Record<string, string> = {
  QUEUED: 'bg-gray-100 text-gray-600',
  PROCESSING: 'bg-sky-50 text-sky-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-rose-50 text-rose-700',
}

export function ImportLogClient({ entity = 'buyer' }: { entity?: 'buyer' | 'vendor' } = {}) {
  const router = useRouter()
  const apiRoot = entity === 'vendor' ? '/api/vendors' : '/api/buyers'
  const noun = entity === 'vendor' ? 'Vendors' : 'Buyers'
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${apiRoot}/import`)
      .then((r) => r.json())
      .then((res) => {
        setRows(Array.isArray(res?.data) ? res.data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function startUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${apiRoot}/import`, { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : 'Upload failed.')
      }
      toast.success('Import queued — processing will start shortly.')
      setUploadOpen(false)
      router.refresh()
      // Optimistically prepend the new job so the table reflects
      // the upload without waiting on the next mount.
      const data = await res.json()
      if (data?.data) setRows((r) => [data.data, ...r])
    } catch (e: any) {
      setError(e.message ?? 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Past CSV imports — {noun.toLowerCase()} added through the Import button below.
        </p>
        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Import {noun}
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin inline" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48">
          <Upload className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No imports yet.</p>
          <p className="text-xs text-gray-300 mt-1">
            Upload a CSV with firstName / lastName / email / phone columns to bulk-add {noun.toLowerCase()}.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-4 py-2.5">File</th>
                <th className="text-center px-3 py-2.5">Rows</th>
                <th className="text-center px-3 py-2.5">Imported</th>
                <th className="text-center px-3 py-2.5">Failed</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 truncate max-w-[280px]">
                      {r.fileName}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {humanFileSize(r.fileSize)}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-700">
                    {r.totalRows || '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-emerald-700">
                    {r.processedRows}
                  </td>
                  <td className="px-3 py-3 text-center text-rose-700">
                    {r.failedRows}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        STATUS_BADGE[r.status] ?? ''
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.errorMessage && (
                      <p className="text-[11px] text-rose-500 mt-1 truncate max-w-[220px]">
                        {r.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-[12px] whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setUploadOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-gray-900">Import {noun}</h2>
              <button onClick={() => setUploadOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-gray-600 mb-3">
              Upload a CSV with these columns (case-insensitive, in any order):
              <span className="block mt-1 font-mono text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-2 py-1">
                firstName, lastName, email, phone, mailingAddress
              </span>
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm text-gray-700 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-[13px] file:font-medium hover:file:bg-blue-100"
            />

            {error && (
              <p className="text-sm text-rose-600 mt-3">{error}</p>
            )}

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setUploadOpen(false)}
                className="text-[13px] font-medium text-gray-600 hover:text-gray-800 px-3 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const f = fileRef.current?.files?.[0]
                  if (!f) {
                    setError('Pick a CSV file first.')
                    return
                  }
                  startUpload(f)
                }}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {uploading ? 'Uploading…' : 'Start Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
