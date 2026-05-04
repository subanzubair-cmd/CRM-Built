import { format } from 'date-fns'
import { CallRecordingPlayer } from '@/components/calls/CallRecordingPlayer'

const ACTION_LABELS: Record<string, string> = {
  LEAD_CREATED: 'Lead Created',
  STAGE_CHANGED: 'Stage Changed',
  STAGE_CHANGE: 'Stage Changed',
  STATUS_CHANGED: 'Status Changed',
  STATUS_CHANGE: 'Status Changed',
  PIPELINE_CHANGE: 'Pipeline Changed',
  NOTE_ADDED: 'Note Added',
  TASK_CREATED: 'Task Created',
  TASK_COMPLETED: 'Task Completed',
  AI_SUMMARY_GENERATED: 'AI Summary Generated',
  HOT_LEAD_SCORED: 'Hot Lead Scored',
  CONTACT_ADDED: 'Contact Added',
  CONTACT_REMOVED: 'Contact Removed',
  PROPERTY_PROMOTED: 'Property Promoted',
  OFFER_RECEIVED: 'Offer Received',
  TAG_ADDED: 'Tag Added',
  TAG_REMOVED: 'Tag Removed',
  MESSAGE_LOGGED: 'Communication Logged',
  LEAD_DELETED: 'Lead Deleted',
}

interface ActivityLog {
  id: string
  action: string
  detail: unknown
  createdAt: Date
  user: { id: string; name: string } | null
  mirroredFromPropertyId?: string | null
}

interface StageRecord {
  id: string
  pipeline: string
  toStage: string
  changedByName: string
  createdAt: Date
}

interface Props {
  activityLogs: ActivityLog[]
  stageHistory: StageRecord[]
}

type FeedItem = {
  id: string
  createdAt: Date
  label: string
  subtext: string
  dot: 'blue' | 'teal' | 'gray'
  /**
   * When set (CALL channel ActivityLog rows that carry the back-pointer in
   * detail.activeCallId), the feed item renders an inline CallRecordingPlayer.
   * Mirrored items get this too — the player resolves the recording from
   * ActiveCall.id, so a mirrored lead can still play the audio.
   */
  activeCallId: string | null
}

function formatStageName(stage: string): string {
  return stage
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ActivityCard({ activityLogs, stageHistory }: Props) {
  const items: FeedItem[] = [
    ...activityLogs.map((log) => {
      const detail = log.detail as { channel?: string; activeCallId?: string | null } | null
      const activeCallId =
        detail?.channel === 'CALL' && typeof detail?.activeCallId === 'string'
          ? detail.activeCallId
          : null
      return {
        id: `act-${log.id}`,
        createdAt: new Date(log.createdAt),
        label:
          ACTION_LABELS[log.action] ??
          log.action
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase()),
        subtext: [
          (log.detail as any)?.description ?? '',
          log.user?.name ? `by ${log.user.name}` : '',
          log.mirroredFromPropertyId
            ? `Mirrored from ${(log.detail as any)?.mirroredFromAddress ?? 'shared contact'}`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        dot: log.mirroredFromPropertyId ? ('teal' as const) : ('blue' as const),
        activeCallId,
      }
    }),
    ...stageHistory.map((sh) => ({
      id: `stage-${sh.id}`,
      createdAt: new Date(sh.createdAt),
      label: `Moved to ${formatStageName(sh.toStage)}`,
      subtext: `${sh.pipeline} · by ${sh.changedByName}`,
      dot: 'gray' as const,
      activeCallId: null,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        Activity <span className="text-gray-400 font-normal">({items.length})</span>
      </h3>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No activity yet</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3 relative">
                <div
                  className={`w-3.5 h-3.5 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                    item.dot === 'blue'
                      ? 'bg-blue-500 border-blue-500'
                      : item.dot === 'teal'
                        ? 'bg-teal-400 border-teal-400'
                        : 'bg-white border-gray-300'
                  }`}
                />
                <div className="flex-1 min-w-0 pb-0.5">
                  <p className="text-sm text-gray-800 font-medium">{item.label}</p>
                  {item.subtext && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{item.subtext}</p>
                  )}
                  <p className="text-[11px] text-gray-300 mt-0.5">
                    {format(item.createdAt, 'MMM d, yyyy h:mm a')}
                  </p>
                  {item.activeCallId && (
                    <div className="mt-2 max-w-md">
                      <CallRecordingPlayer callId={item.activeCallId} eagerMeta />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
