'use client'

import { useEffect, useRef, useState } from 'react'
import { Zap, CheckCircle2, Circle, X } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'

/* ── Types ─────────────────────────────────────────────────────────────── */
interface DripStep {
  id: string
  order: number
  actionType: string
  delayAmount: number
  delayUnit: string
  scheduledAt: string
  isCompleted: boolean
}

interface DripEnrollment {
  id: string
  enrolledAt: string
  isActive: boolean
  currentStep: number
  autoStopOnReply: boolean
  campaign: { id: string | null; name: string; steps: DripStep[] }
  stats: {
    smsSent: number
    emailSent: number
    taskCreated: number
    webhookFired: number
    tagChanged: number
    statusChanged: number
    dripEnroll: number
  }
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
const ACTION_LABEL: Record<string, string> = {
  SMS:           'SMS',
  EMAIL:         'Email',
  TASK:          'Task',
  WEBHOOK:       'Webhook',
  TAG_CHANGE:    'Tag Change',
  STATUS_CHANGE: 'Status Change',
  DRIP_ENROLL:   'Drip Enroll',
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function duration(enrolledAt: string) {
  try {
    return formatDistanceToNowStrict(new Date(enrolledAt), { addSuffix: false })
  } catch {
    return '—'
  }
}

/* ── Stat Row ───────────────────────────────────────────────────────────── */
function StatRow({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
      <p className="text-xs font-semibold text-gray-800">{value} {unit}{value !== 1 ? 's' : ''}</p>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export function DripStatusBadge({ propertyId }: { propertyId: string }) {
  const [enrollments, setEnrollments] = useState<DripEnrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/drip-status`)
      .then((r) => r.json())
      .then((d) => setEnrollments(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [propertyId])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (loading || enrollments.length === 0) return null

  const enrollment = enrollments[selectedIdx] ?? enrollments[0]
  const { campaign, stats } = enrollment

  return (
    <div className="relative flex-shrink-0">
      {/* ── Trigger Icon ── */}
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Active drip sequence"
        className="relative flex-shrink-0 p-1 rounded hover:bg-teal-50 transition-colors"
      >
        <Zap className="w-4 h-4 text-teal-500" fill="currentColor" />
        {/* Pulsing green dot */}
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 ring-1 ring-white animate-pulse" />
      </button>

      {/* ── Hover Panel ── */}
      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-2 z-[200] w-72 bg-white border border-gray-200 rounded-xl shadow-2xl text-sm overflow-hidden"
          style={{ minWidth: 288 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-teal-50">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" fill="currentColor" />
              <span className="text-xs font-bold text-teal-800 uppercase tracking-wide">Drip Sequence</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Multi-enrollment picker */}
          {enrollments.length > 1 && (
            <div className="px-4 pt-2 flex gap-1 flex-wrap">
              {enrollments.map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedIdx(i)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                    i === selectedIdx
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {e.campaign.name}
                </button>
              ))}
            </div>
          )}

          <div className="px-4 py-3 space-y-3">
            {/* Campaign name */}
            <div>
              <p className="text-xs font-bold text-gray-900 truncate">{campaign.name}</p>
              <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                <p><span className="font-medium text-gray-700">Started:</span> {fmt(enrollment.enrolledAt)}</p>
                <p><span className="font-medium text-gray-700">Duration:</span> {duration(enrollment.enrolledAt)}</p>
                <p><span className="font-medium text-gray-700">Auto Stop:</span> {enrollment.autoStopOnReply ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {/* Drip Summary */}
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Drip Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <StatRow label="#SMS sent"        value={stats.smsSent}       unit="SMS" />
                <StatRow label="#Email sent"      value={stats.emailSent}     unit="Email" />
                <StatRow label="Tasks"            value={stats.taskCreated}   unit="Task" />
                <StatRow label="Webhook Triggers" value={stats.webhookFired}  unit="Webhook" />
                <StatRow label="Tag Changes"      value={stats.tagChanged}    unit="Tag" />
                <StatRow label="Status Changes"   value={stats.statusChanged} unit="Status" />
                <StatRow label="Drip Enrollments" value={stats.dripEnroll}    unit="Drip" />
              </div>
            </div>

            {/* Steps Summary */}
            {campaign.steps.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Steps Summary ({campaign.steps.length})
                </p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {campaign.steps.map((step, i) => (
                    <div key={step.id} className="flex items-start gap-2">
                      {step.isCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold leading-tight ${step.isCompleted ? 'text-teal-700' : 'text-gray-700'}`}>
                          Step #{i + 1} — {ACTION_LABEL[step.actionType] ?? step.actionType}
                        </p>
                        <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
                          {step.isCompleted ? '' : 'Scheduled '}
                          {fmt(step.scheduledAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cancel drip shortcut */}
            <div className="pt-1 border-t border-gray-100">
              <button
                onClick={async () => {
                  if (!confirm('Cancel this drip sequence for this lead?')) return
                  try {
                    await fetch(`/api/campaign-enrollments/${enrollment.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'cancel' }),
                    })
                    setEnrollments((prev) => prev.filter((e) => e.id !== enrollment.id))
                    setSelectedIdx(0)
                    if (enrollments.length <= 1) setOpen(false)
                  } catch { /* ignore */ }
                }}
                className="w-full text-left text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                Cancel drip for this lead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
