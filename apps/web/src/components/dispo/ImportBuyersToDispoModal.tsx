'use client'

import { useState, useRef } from 'react'
import { X, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface DispoStageOption {
  key: string
  label: string
}

interface Props {
  propertyId: string
  stages: DispoStageOption[]
  onClose: () => void
}

interface ParsedRow {
  firstName: string
  lastName?: string
  phone?: string
  email?: string
  notes?: string
}

interface SkippedDetail {
  name: string
  stage: string
}

interface ImportResult {
  created: number
  merged: number
  skipped: number
  skippedDetails: SkippedDetail[]
  errors: string[]
}

function parseCsvRows(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''))

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = cells[idx] ?? '' })

    // Support "name" column (split on first space) or firstName/lastName separately
    let firstName = obj.firstname ?? obj.first ?? ''
    let lastName = obj.lastname ?? obj.last ?? ''
    if (!firstName && obj.name) {
      const parts = obj.name.split(' ')
      firstName = parts[0] ?? ''
      lastName = parts.slice(1).join(' ')
    }
    if (!firstName) continue

    rows.push({
      firstName,
      lastName: lastName || undefined,
      phone: obj.phone || obj.mobile || obj.cell || undefined,
      email: obj.email || undefined,
      notes: obj.notes || obj.note || undefined,
    })
  }
  return rows
}

export function ImportBuyersToDispoModal({ propertyId, stages, onClose }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedStage, setSelectedStage] = useState(stages[0]?.key ?? 'POTENTIAL_BUYER')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCsvRows(text)
      setParsedRows(rows)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (parsedRows.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/buyer-matches/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispoStage: selectedStage, rows: parsedRows }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Import failed')
        return
      }
      setResult(data)
      router.refresh()
    } catch {
      toast.error('Network error during import')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Import Buyers from CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          /* ── Result view ── */
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">Import complete</span>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-green-50 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Created</dt>
                <dd className="text-xl font-bold text-green-700">{result.created}</dd>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Merged</dt>
                <dd className="text-xl font-bold text-blue-700">{result.merged}</dd>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Skipped</dt>
                <dd className="text-xl font-bold text-gray-600">{result.skipped}</dd>
              </div>
            </dl>

            {/* Skipped buyers list — already in pipeline */}
            {result.skippedDetails?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-800 mb-2">
                  Already in pipeline ({result.skippedDetails.length})
                </p>
                <ul className="space-y-1 max-h-36 overflow-y-auto">
                  {result.skippedDetails.map((d, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-800 font-medium">{d.name}</span>
                      <span className="ml-2 flex-shrink-0 bg-white border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 text-[10px] font-medium">
                        {d.stage}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Errors ({result.errors.length})</p>
                <ul className="text-xs text-red-600 space-y-0.5 max-h-24 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Upload view ── */
          <div className="p-5 space-y-4">
            {/* Stage picker */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Add to stage</label>
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* File picker */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CSV file</label>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                {fileName ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span>{fileName}</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="w-6 h-6 text-gray-400 mx-auto" />
                    <p className="text-sm text-gray-600">Click to choose a CSV file</p>
                    <p className="text-xs text-gray-400">Required columns: firstName (or name), plus phone or email</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="hidden"
              />
            </div>

            {/* Preview */}
            {parsedRows.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600 font-medium mb-1">
                  {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed
                </p>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {parsedRows.slice(0, 8).map((r, i) => (
                    <p key={i} className="text-xs text-gray-500 truncate">
                      {[r.firstName, r.lastName].filter(Boolean).join(' ')}
                      {r.phone ? ` · ${r.phone}` : ''}
                      {r.email ? ` · ${r.email}` : ''}
                    </p>
                  ))}
                  {parsedRows.length > 8 && (
                    <p className="text-xs text-gray-400">+{parsedRows.length - 8} more…</p>
                  )}
                </div>
              </div>
            )}

            {parsedRows.length === 0 && fileName && (
              <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg p-3 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No valid rows found. Check that the file has a header row with at least firstName (or name) and phone or email columns.
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2 px-4 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={parsedRows.length === 0 || submitting}
                className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Importing…' : `Import ${parsedRows.length > 0 ? parsedRows.length : ''} buyers`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
