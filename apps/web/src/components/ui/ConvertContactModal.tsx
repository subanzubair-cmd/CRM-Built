'use client'

/**
 * Modal for converting a buyer/vendor to another entity type.
 *
 * Conversions:
 *   - buyer  -> vendor  (simple: pick a category)
 *   - buyer  -> lead    (pick pipeline DTS/DTA + optional property address)
 *   - vendor -> buyer   (simple confirmation)
 *   - vendor -> lead    (pick pipeline DTS/DTA + optional property address)
 *
 * The modal adapts its form fields based on the target type:
 *   - "vendor" target: shows category picker
 *   - "lead" target: shows pipeline (DTS/DTA) radio + address fields
 *   - "buyer" target: simple confirmation
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

const VENDOR_CATEGORIES = [
  'General Contractor',
  'Plumber',
  'Electrician',
  'HVAC',
  'Roofer',
  'Painter',
  'Flooring',
  'Inspector',
  'Title Company',
  'Attorney',
  'Insurance',
  'Property Manager',
  'Photographer',
  'Other',
]

interface Props {
  open: boolean
  onClose: () => void
  /** Source entity type */
  from: 'buyer' | 'vendor'
  /** Source entity id (Buyer.id or Vendor.id) */
  sourceId: string
  /** Display name for the contact being converted */
  displayName: string
}

type TargetType = 'buyer' | 'vendor' | 'lead'

export function ConvertContactModal({
  open,
  onClose,
  from,
  sourceId,
  displayName,
}: Props) {
  const router = useRouter()
  const [target, setTarget] = useState<TargetType | null>(null)
  const [pipeline, setPipeline] = useState<'DTS' | 'DTA'>('DTS')
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [category, setCategory] = useState('Other')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  // Available targets depend on the source type.
  const targets: Array<{ value: TargetType; label: string; desc: string }> =
    from === 'buyer'
      ? [
          { value: 'vendor', label: 'Vendor', desc: 'Convert to a vendor/contractor record' },
          { value: 'lead', label: 'Lead', desc: 'Create a new lead in DTS or DTA pipeline' },
        ]
      : [
          { value: 'buyer', label: 'Buyer', desc: 'Convert to a buyer record' },
          { value: 'lead', label: 'Lead', desc: 'Create a new lead in DTS or DTA pipeline' },
        ]

  async function submit() {
    if (!target) {
      setError('Select a conversion target.')
      return
    }
    if (target === 'lead' && !pipeline) {
      setError('Select a pipeline (DTS or DTA).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        from,
        sourceId,
        to: target,
      }
      if (target === 'lead') {
        body.pipeline = pipeline
        body.streetAddress = streetAddress.trim() || undefined
        body.city = city.trim() || undefined
        body.state = state.trim() || undefined
        body.zip = zip.trim() || undefined
      }
      if (target === 'vendor') {
        body.category = category
      }

      const res = await fetch('/api/contacts/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Conversion failed.')
        return
      }
      if (data.warning) {
        toast.info(data.warning)
      } else {
        toast.success(`Converted to ${target} successfully.`)
      }
      onClose()
      if (data.redirectUrl) {
        router.push(data.redirectUrl)
      }
    } catch (e: any) {
      setError(e.message ?? 'Conversion failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-blue-500" />
            Convert {from === 'buyer' ? 'Buyer' : 'Vendor'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[13px] text-gray-600">
            Convert{' '}
            <span className="font-semibold text-gray-900">{displayName || 'this contact'}</span>{' '}
            to a different entity type. The original {from} record will be marked inactive.
          </p>

          {/* Target selection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Convert to *
            </label>
            <div className="space-y-2">
              {targets.map((t) => (
                <label
                  key={t.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    target === t.value
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="convertTarget"
                    checked={target === t.value}
                    onChange={() => setTarget(t.value)}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-[13px] font-medium text-gray-900">{t.label}</span>
                    <p className="text-[11px] text-gray-500 mt-0.5">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Lead-specific fields */}
          {target === 'lead' && (
            <div className="space-y-3 bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Pipeline *
                </label>
                <div className="flex items-center gap-4">
                  {(['DTS', 'DTA'] as const).map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                      <input
                        type="radio"
                        name="pipeline"
                        checked={pipeline === p}
                        onChange={() => setPipeline(p)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">
                        {p === 'DTS' ? 'DTS (Deal To Sell)' : 'DTA (Deal To Acquire)'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Property Address
                </label>
                <input
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="123 Main St"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Zip</label>
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Vendor-specific fields */}
          {target === 'vendor' && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Vendor Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !target}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  )
}
