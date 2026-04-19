'use client'

/**
 * DocumentsCard
 *
 * Displays PropertyFile records for a property.
 * Upload → POST /api/properties/[id]/files
 * Download → presigned URL from GET /api/properties/[id]/files
 * Delete → DELETE /api/properties/[id]/files/[fileId]
 * Request Signature → POST /api/properties/[id]/esign (stub)
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, Download, FileText, Loader2, FilePen } from 'lucide-react'

interface PropertyFile {
  id: string
  name: string
  mimeType: string
  size: number
  type: string
  createdAt: string
  uploadedByName: string | null
  downloadUrl: string | null
}

interface Props {
  propertyId: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentsCard({ propertyId }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<PropertyFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [signingId, setSigningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadFiles() {
    try {
      const res = await fetch(`/api/properties/${propertyId}/files`)
      if (!res.ok) throw new Error('Failed to load files')
      const data = await res.json()
      setFiles(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading files')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFiles() }, [propertyId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/properties/${propertyId}/files`, { method: 'POST', body: fd })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Upload failed')
      }
      await loadFiles()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(fileId: string) {
    if (!confirm('Delete this file?')) return
    setDeletingId(fileId)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/files/${fileId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRequestSignature(fileId: string) {
    setSigningId(fileId)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/esign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      })
      if (!res.ok) throw new Error('Failed to create e-sign request')
      alert('E-sign request created (stub — no real provider configured)')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'E-sign error')
    } finally {
      setSigningId(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Documents</h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            id={`doc-upload-${propertyId}`}
            onChange={handleUpload}
            disabled={uploading}
          />
          <label
            htmlFor={`doc-upload-${propertyId}`}
            className="flex items-center gap-1.5 cursor-pointer text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg transition-colors"
          >
            {uploading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />}
            Upload
          </label>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
        </div>
      ) : files.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No documents yet</p>
          <p className="text-xs text-gray-300 mt-1">Upload contracts, photos, or other files</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                <p className="text-[11px] text-gray-400">
                  {formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString()}
                  {file.uploadedByName ? ` · ${file.uploadedByName}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Request Signature */}
                <button
                  onClick={() => handleRequestSignature(file.id)}
                  disabled={signingId === file.id}
                  title="Request Signature"
                  className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
                >
                  {signingId === file.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <FilePen className="w-3.5 h-3.5" />}
                </button>
                {/* Download */}
                {file.downloadUrl ? (
                  <a
                    href={file.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download"
                    className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="p-1.5 text-gray-200 cursor-not-allowed">
                    <Download className="w-3.5 h-3.5" />
                  </span>
                )}
                {/* Delete */}
                <button
                  onClick={() => handleDelete(file.id)}
                  disabled={deletingId === file.id}
                  title="Delete"
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {deletingId === file.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
