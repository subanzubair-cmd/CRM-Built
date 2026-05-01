'use client'

/**
 * Inline warning rendered beneath a phone/email form field when an
 * existing contact with the same value is detected. Offers two
 * actions: "View existing" (new tab) and "Update existing" (navigates
 * to the detail page in edit mode).
 */

import { AlertTriangle, ExternalLink, Pencil } from 'lucide-react'
import type { ContactMatch } from '@/components/buyers/ContactFieldAutocomplete'

interface Props {
  type: 'buyer' | 'vendor'
  match: ContactMatch
  fieldLabel: string
}

export function DuplicateInlineWarning({ type, match, fieldLabel }: Props) {
  const name =
    [match.firstName, match.lastName].filter(Boolean).join(' ') || '(unnamed)'
  const entityId = type === 'vendor' ? match.vendorId : match.buyerId
  const basePath = type === 'vendor' ? '/vendors' : '/buyers'

  return (
    <div className="mt-1.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-amber-800">
          A {type} with this {fieldLabel} already exists:{' '}
          <span className="font-semibold">{name}</span>
        </p>
        {entityId && (
          <div className="flex items-center gap-3 mt-1.5">
            <button
              type="button"
              onClick={() => window.open(`${basePath}/${entityId}`, '_blank')}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900"
            >
              <ExternalLink className="w-3 h-3" />
              View existing
            </button>
            <button
              type="button"
              onClick={() => window.open(`${basePath}/${entityId}?edit=1`, '_blank')}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
            >
              <Pencil className="w-3 h-3" />
              Update existing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
