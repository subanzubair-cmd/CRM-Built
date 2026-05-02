'use client'

/**
 * BuyerImportModal — 3-step wizard
 *
 *  Step 1 – Upload CSV + preview first 5 rows
 *  Step 2 – Map CSV columns → system fields
 *  Step 3 – Import (synchronous) + results summary
 *
 * The import calls POST /api/buyers/import with { rows, columnMap }
 * which triggers the synchronous path added alongside the existing
 * MinIO-queue path.
 */

import { useState, useRef } from 'react'
import {
  X,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  onClose: () => void
}

// ─────────────────────────────────────────────
// System field definitions
// ─────────────────────────────────────────────

const SYSTEM_FIELDS = [
  { key: 'firstName',     label: 'First Name' },
  { key: 'lastName',      label: 'Last Name' },
  { key: 'fullName',      label: 'Full Name (split on space)' },
  { key: 'phone',         label: 'Phone' },
  { key: 'email',         label: 'Email' },
  { key: 'tags',          label: 'Tags (comma-separated)' },
  { key: 'howHeardAbout', label: 'How Heard About' },
  { key: 'mailingAddress',label: 'Mailing Address' },
  { key: 'notes',         label: 'Notes' },
  { key: 'targetCities',  label: 'Target Cities (comma-separated)' },
  { key: 'targetZips',    label: 'Target Zips (comma-separated)' },
  { key: 'targetCounties',label: 'Target Counties (comma-separated)' },
  { key: 'targetStates',  label: 'Target States (comma-separated)' },
  { key: 'source',        label: 'Source / Lead Source' },
] as const

type SystemFieldKey = typeof SYSTEM_FIELDS[number]['key']
const DO_NOT_IMPORT = '__skip__'

// ─────────────────────────────────────────────
// Auto-mapping fuzzy rules
// ─────────────────────────────────────────────

function autoMap(header: string): SystemFieldKey | typeof DO_NOT_IMPORT {
  const h = header.toLowerCase().trim()

  if (['name', 'full name', 'fullname', 'buyer name'].includes(h)) return 'fullName'
  if (['first name', 'firstname', 'first'].includes(h)) return 'firstName'
  if (['last name', 'lastname', 'last'].includes(h)) return 'lastName'
  if (['phone', 'phone number', 'contact number', 'mobile', 'cell'].includes(h)) return 'phone'
  if (['email', 'email address'].includes(h)) return 'email'
  if (['tag', 'tags'].includes(h)) return 'tags'
  if (['how heard', 'how did you hear', 'source of contact', 'heard about'].includes(h)) return 'howHeardAbout'
  if (['address', 'mailing address', 'mailing'].includes(h)) return 'mailingAddress'
  if (['note', 'notes'].includes(h)) return 'notes'
  if (['city', 'cities', 'target city', 'target cities'].includes(h)) return 'targetCities'
  if (['zip', 'zips', 'target zip', 'target zips', 'postal'].includes(h)) return 'targetZips'
  if (['county', 'counties', 'target county', 'target counties'].includes(h)) return 'targetCounties'
  if (['state', 'states', 'target state', 'target states'].includes(h)) return 'targetStates'
  if (['source', 'lead source', 'buyer type', 'type'].includes(h)) return 'source'

  return DO_NOT_IMPORT
}

// ─────────────────────────────────────────────
// CSV parsing helpers
// ─────────────────────────────────────────────

/** Split a single CSV line into cells, handling quoted fields. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        // Peek: double-quote escape
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuote = true
      } else if (ch === ',') {
        cells.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  cells.push(cur.trim())
  return cells
}

interface ParsedCsv {
  headers: string[]
  /** Raw rows as Record<header, value> — all 500 kept for import */
  rows: Record<string, string>[]
  /** First 5 rows for preview */
  preview: Record<string, string>[]
}

function parseCsvText(text: string): ParsedCsv | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 1) return null
  const headers = splitCsvLine(lines[0])
  if (headers.length === 0) return null

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? ''
    })
    rows.push(obj)
  }

  return { headers, rows, preview: rows.slice(0, 5) }
}

// ─────────────────────────────────────────────
// Import result types
// ─────────────────────────────────────────────

interface ImportResult {
  created: number
  merged: number
  skipped: number
  errors: string[]
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function BuyerImportModal({ onClose }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 state
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')

  // Step 2 state: maps csvHeader → systemFieldKey | DO_NOT_IMPORT
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [mapError, setMapError] = useState('')

  // Step 3 state
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')

  // ── Step 1: file handling ──

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')
    setParsed(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const result = parseCsvText(text)
      if (!result || result.headers.length === 0) {
        setFileError('Could not parse CSV. Make sure the file has a header row.')
        return
      }
      setParsed(result)
      // Auto-map when we get headers
      const initial: Record<string, string> = {}
      result.headers.forEach((h) => { initial[h] = autoMap(h) })
      setColumnMap(initial)
    }
    reader.readAsText(file)
  }

  function goToStep2() {
    if (!parsed) return
    setStep(2)
    setMapError('')
  }

  // ── Step 2: mapping ──

  /** Check if a system field is already mapped to a *different* CSV column */
  function isDuplicateMapping(csvHeader: string, sysKey: string): boolean {
    if (sysKey === DO_NOT_IMPORT) return false
    return Object.entries(columnMap).some(([h, v]) => h !== csvHeader && v === sysKey)
  }

  function validateMapping(): boolean {
    const mappedKeys = Object.values(columnMap)
    const hasName = mappedKeys.includes('firstName') || mappedKeys.includes('fullName')
    const hasContact = mappedKeys.includes('phone') || mappedKeys.includes('email')
    if (!hasName || !hasContact) {
      setMapError(
        !hasName
          ? 'Map at least First Name or Full Name.'
          : 'Map at least Phone or Email.',
      )
      return false
    }
    // Check for duplicate mappings
    for (const [header, sysKey] of Object.entries(columnMap)) {
      if (isDuplicateMapping(header, sysKey)) {
        setMapError(`"${sysKey}" is mapped to more than one column. Each field can only map once.`)
        return false
      }
    }
    setMapError('')
    return true
  }

  async function goToStep3() {
    if (!validateMapping()) return
    setStep(3)
    await runImport()
  }

  // ── Step 3: import ──

  async function runImport() {
    if (!parsed) return
    setImporting(true)
    setImportError('')
    try {
      const res = await fetch('/api/buyers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed.rows, columnMap }),
      })
      const data = await res.json()
      if (!res.ok) {
        setImportError(
          typeof data.error === 'string' ? data.error : 'Import failed. Please try again.',
        )
        setImporting(false)
        return
      }
      setResult(data)
      router.refresh()
    } catch {
      setImportError('Network error — please try again.')
    } finally {
      setImporting(false)
    }
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">Import Buyers from CSV</h2>
            <StepIndicator current={step} />
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <Step1
              fileRef={fileRef}
              fileName={fileName}
              parsed={parsed}
              fileError={fileError}
              onFileChange={handleFileChange}
            />
          )}
          {step === 2 && parsed && (
            <Step2
              headers={parsed.headers}
              columnMap={columnMap}
              onMapChange={(header, val) => {
                setColumnMap((prev) => ({ ...prev, [header]: val }))
                setMapError('')
              }}
              isDuplicate={isDuplicateMapping}
              mapError={mapError}
            />
          )}
          {step === 3 && (
            <Step3 importing={importing} result={result} importError={importError} />
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 flex-shrink-0">
          {/* Back */}
          <div>
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>

          {/* Cancel / Next / Done */}
          <div className="flex items-center gap-2">
            {step !== 3 && (
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}
            {step === 1 && (
              <button
                onClick={goToStep2}
                disabled={!parsed}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 2 && (
              <button
                onClick={goToStep3}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Import
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 3 && !importing && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1 text-xs text-gray-400">
      {([1, 2, 3] as const).map((n, i) => (
        <span key={n} className="flex items-center gap-1">
          {i > 0 && <span className="w-4 h-px bg-gray-200 block" />}
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold transition-colors ${
              n < current
                ? 'bg-blue-600 text-white'
                : n === current
                  ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                  : 'bg-gray-100 text-gray-400'
            }`}
          >
            {n < current ? <CheckCircle className="w-3.5 h-3.5" /> : n}
          </span>
        </span>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// Step 1 – Upload & Preview
// ─────────────────────────────────────────────

function Step1({
  fileRef,
  fileName,
  parsed,
  fileError,
  onFileChange,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>
  fileName: string
  parsed: ParsedCsv | null
  fileError: string
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-gray-500">
        Upload a <code className="bg-gray-100 px-1 rounded">.csv</code> file. The first row must be
        a header row. Max 25 MB.
      </p>

      {/* Drop zone */}
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
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFileChange}
        className="hidden"
      />

      {fileError && (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg p-3 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {fileError}
        </div>
      )}

      {/* Preview table */}
      {parsed && parsed.preview.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            Preview — first {parsed.preview.length} of {parsed.rows.length} rows
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {parsed.headers.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap border-b border-gray-200"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.preview.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {parsed.headers.map((h) => (
                      <td
                        key={h}
                        className="px-3 py-1.5 text-gray-700 border-b border-gray-100 whitespace-nowrap max-w-[160px] truncate"
                      >
                        {row[h] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 5 && (
            <p className="text-[10px] text-gray-400 mt-1 text-right">
              +{parsed.rows.length - 5} more rows (not shown)
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Step 2 – Column Mapping
// ─────────────────────────────────────────────

function Step2({
  headers,
  columnMap,
  onMapChange,
  isDuplicate,
  mapError,
}: {
  headers: string[]
  columnMap: Record<string, string>
  onMapChange: (header: string, val: string) => void
  isDuplicate: (header: string, sysKey: string) => boolean
  mapError: string
}) {
  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-gray-500">
        For each CSV column, choose the system field it maps to. Each system field can only be
        mapped to one column.
      </p>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-1/2 border-b border-gray-200">
                CSV Column
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-1/2 border-b border-gray-200">
                System Field
              </th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header, i) => {
              const current = columnMap[header] ?? DO_NOT_IMPORT
              const dup = isDuplicate(header, current)
              return (
                <tr key={header} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-2 text-gray-800 font-medium border-b border-gray-100 whitespace-nowrap">
                    {header}
                  </td>
                  <td className="px-4 py-2 border-b border-gray-100">
                    <select
                      value={current}
                      onChange={(e) => onMapChange(header, e.target.value)}
                      className={`w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                        dup ? 'border-red-400 focus:ring-red-400' : 'border-gray-300'
                      }`}
                      aria-label={`Map "${header}"`}
                    >
                      <option value={DO_NOT_IMPORT}>— Do not import —</option>
                      {SYSTEM_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {dup && (
                      <p className="text-[11px] text-red-500 mt-0.5">
                        Already mapped to another column
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {mapError && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 rounded-lg p-3 text-xs border border-red-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {mapError}
        </div>
      )}

      <p className="text-[11px] text-gray-400 italic">
        * Required: First Name (or Full Name) and Phone or Email
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// Step 3 – Import Results
// ─────────────────────────────────────────────

function Step3({
  importing,
  result,
  importError,
}: {
  importing: boolean
  result: ImportResult | null
  importError: string
}) {
  if (importing) {
    return (
      <div className="p-10 flex flex-col items-center gap-3 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Importing buyers…</p>
        <p className="text-xs text-gray-400">This may take a moment for large files.</p>
      </div>
    )
  }

  if (importError) {
    return (
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-red-700 bg-red-50 rounded-lg p-4 text-sm border border-red-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{importError}</p>
        </div>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle className="w-5 h-5 flex-shrink-0" />
        <span className="font-medium text-sm">Import complete</span>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-green-50 rounded-lg p-3">
          <dt className="text-xs text-gray-500">Created</dt>
          <dd className="text-2xl font-bold text-green-700">{result.created}</dd>
        </div>
        <div className="bg-blue-50 rounded-lg p-3">
          <dt className="text-xs text-gray-500">Merged</dt>
          <dd className="text-2xl font-bold text-blue-700">{result.merged}</dd>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <dt className="text-xs text-gray-500">Skipped</dt>
          <dd className="text-2xl font-bold text-gray-600">{result.skipped}</dd>
        </div>
      </dl>

      {result.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-medium text-red-700 mb-1">
            Errors ({result.errors.length})
          </p>
          <ul className="text-xs text-red-600 space-y-0.5 max-h-28 overflow-y-auto">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
