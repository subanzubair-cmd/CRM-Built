'use client'

import { useState, useRef } from 'react'
import { X, Upload, FileText, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  onClose: () => void
}

export function BuyerImportModal({ onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [queued, setQueued] = useState(false)

  async function handleSubmit() {
    if (!file) return
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/buyers/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Upload failed')
        return
      }
      setQueued(true)
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Import Buyers from CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {queued ? (
          <div className="p-6 space-y-3 text-center">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
            <p className="font-medium text-gray-900">Import queued!</p>
            <p className="text-sm text-gray-500">
              Your file is being processed. Check the <strong>Import Log</strong> tab for progress.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">
              CSV must include <code className="bg-gray-100 px-1 rounded">firstName</code> (or <code className="bg-gray-100 px-1 rounded">name</code>) plus at least one of <code className="bg-gray-100 px-1 rounded">phone</code> or <code className="bg-gray-100 px-1 rounded">email</code>. Max 25 MB.
            </p>

            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>{file.name}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 text-gray-400 mx-auto" />
                  <p className="text-sm text-gray-600">Click to choose a CSV file</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 px-4 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!file || submitting}
                className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
