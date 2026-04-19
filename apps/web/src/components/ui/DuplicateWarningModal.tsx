'use client'

import { X, ExternalLink, UserPlus, AlertTriangle } from 'lucide-react'

interface Props {
  type: 'buyer' | 'vendor' | 'lead'
  message: string
  existingName?: string
  existingId: string
  /** URL to view the existing record */
  viewUrl: string
  /** Called when user wants to use the existing record (e.g. add existing buyer to pipeline) */
  onUseExisting?: () => void
  /** Label for the "use existing" button */
  useExistingLabel?: string
  onClose: () => void
}

export function DuplicateWarningModal({
  type,
  message,
  existingName,
  existingId,
  viewUrl,
  onUseExisting,
  useExistingLabel,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-500 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-white" />
            <h2 className="text-white text-sm font-bold">Duplicate Found</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Message */}
          <p className="text-sm text-gray-700">{message}</p>

          {/* Existing record info */}
          {existingName && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{existingName}</p>
              <p className="text-xs text-gray-500 mt-0.5">Existing {type}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            {onUseExisting && (
              <button
                onClick={onUseExisting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {useExistingLabel ?? `Add existing ${type}`}
              </button>
            )}

            <button
              onClick={() => window.open(viewUrl, '_blank')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View existing {type}
            </button>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
