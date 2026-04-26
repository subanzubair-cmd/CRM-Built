import { AlertOctagon } from 'lucide-react'

interface Props {
  /**
   * The Property.deadReasons array (preset reason strings checked at the
   * time of the dead transition). May be empty if the lead was killed
   * via a path that didn't capture reasons (legacy bulk dead-mark, merge
   * cleanup) — in which case we surface a fallback note.
   */
  deadReasons: string[]
  /**
   * Verbatim free-text from the dead-lead modal's "Other Reasons" field.
   * Stored exactly as typed; rendered as-is.
   */
  deadOtherReason: string | null
  /** When the lead transitioned to DEAD. */
  deadAt: Date | string | null
}

/**
 * Read-only summary of why a lead was killed. Rendered at the bottom of
 * the lead detail page when the lead is in DEAD status. The same data
 * is in ActivityLog for audit purposes; this card is the persistent,
 * always-visible reference for the lead.
 */
export function DeadReasonsCard({ deadReasons, deadOtherReason, deadAt }: Props) {
  const hasReasons = deadReasons.length > 0
  const hasOther = !!deadOtherReason && deadOtherReason.trim().length > 0
  if (!hasReasons && !hasOther && !deadAt) return null

  const deadAtDate = deadAt ? new Date(deadAt) : null

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <div className="flex items-start gap-2 mb-3">
        <AlertOctagon className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-red-900">Reason for Dead Status</h3>
          {deadAtDate ? (
            <p className="text-xs text-red-700/80 mt-0.5">
              Marked dead on{' '}
              {deadAtDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          ) : null}
        </div>
      </div>

      {hasReasons ? (
        <ul className="text-sm text-red-900 space-y-1 ml-6 list-disc">
          {deadReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {hasOther ? (
        <div className="mt-3 ml-6">
          <p className="text-xs uppercase tracking-wide font-semibold text-red-800 mb-1">
            Other Reasons
          </p>
          <p className="text-sm text-red-900 whitespace-pre-wrap">{deadOtherReason}</p>
        </div>
      ) : null}

      {!hasReasons && !hasOther ? (
        <p className="text-sm text-red-800/80 ml-6 italic">
          No reason was captured at the time this lead was marked dead.
        </p>
      ) : null}
    </div>
  )
}
