'use client'

import {
  MessageSquare,
  Mail,
  Phone,
  Voicemail,
  StickyNote,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

export interface CampaignStep {
  id: string
  order: number
  channel: string
  subject: string | null
  body: string
  delayDays: number
  delayHours: number
  isActive: boolean
}

const CHANNEL_CONFIG: Record<string, { icon: typeof MessageSquare; label: string; color: string; bg: string; border: string }> = {
  SMS:   { icon: MessageSquare, label: 'SMS',       color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200' },
  EMAIL: { icon: Mail,          label: 'Email',     color: 'text-purple-600', bg: 'bg-purple-50',  border: 'border-purple-200' },
  CALL:  { icon: Phone,         label: 'Call',      color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200' },
  RVM:   { icon: Voicemail,     label: 'Ringless VM', color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200' },
  NOTE:  { icon: StickyNote,    label: 'Note',      color: 'text-gray-600',   bg: 'bg-gray-50',    border: 'border-gray-200' },
}

function formatDelay(days: number, hours: number): string {
  if (days === 0 && hours === 0) return 'Immediately'
  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
  return parts.join(' ')
}

interface Props {
  step: CampaignStep
  index: number
  totalSteps: number
  isFirst: boolean
  isLast: boolean
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleActive: () => void
}

export function CampaignStepCard({
  step,
  index,
  totalSteps,
  isFirst,
  isLast,
  isEditing,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleActive,
}: Props) {
  const channel = CHANNEL_CONFIG[step.channel] ?? CHANNEL_CONFIG.NOTE
  const Icon = channel.icon
  const delayText = formatDelay(step.delayDays, step.delayHours)

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center w-10 flex-shrink-0">
        {/* Top line */}
        {!isFirst && <div className="w-0.5 h-4 bg-gray-200" />}
        {isFirst && <div className="h-4" />}

        {/* Step circle */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            step.isActive
              ? `${channel.bg} ${channel.border} border-2`
              : 'bg-gray-100 border-2 border-gray-200'
          }`}
        >
          <Icon
            className={`w-4.5 h-4.5 ${step.isActive ? channel.color : 'text-gray-400'}`}
          />
        </div>

        {/* Bottom line */}
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 min-h-[16px]" />}
      </div>

      {/* Card */}
      <div
        className={`flex-1 mb-2 rounded-xl border transition-all ${
          isEditing
            ? 'border-blue-300 ring-2 ring-blue-100 shadow-sm'
            : step.isActive
              ? 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              : 'border-gray-100 bg-gray-50 opacity-60'
        }`}
      >
        {/* Delay badge above card */}
        {!isFirst && (
          <div className="px-4 pt-2.5 pb-0">
            <div className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <Clock className="w-3 h-3" />
              <span>{delayText} after previous step</span>
            </div>
          </div>
        )}

        <div className="px-4 py-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${channel.bg} ${channel.color}`}
              >
                <Icon className="w-3 h-3" />
                {channel.label}
              </span>
              <span className="text-[11px] text-gray-400 font-medium">
                Step {index + 1} of {totalSteps}
              </span>
              {!step.isActive && (
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                  Paused
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onToggleActive}
                className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                  step.isActive ? 'text-emerald-500 hover:text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                }`}
                title={step.isActive ? 'Pause step' : 'Activate step'}
              >
                {step.isActive ? (
                  <ToggleRight className="w-4 h-4" />
                ) : (
                  <ToggleLeft className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={onEdit}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit step"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
                title="Delete step"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content preview */}
          <div className="mt-2">
            {step.subject && (
              <p className="text-[13px] font-medium text-gray-800 truncate mb-0.5">
                {step.subject}
              </p>
            )}
            <p className="text-[12px] text-gray-500 line-clamp-2 leading-relaxed">
              {step.body}
            </p>
          </div>

          {/* Placeholder tokens preview */}
          {(step.body.includes('{') || (step.subject && step.subject.includes('{'))) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {extractTokens(step.body + (step.subject ?? '')).map((token) => (
                <span
                  key={token}
                  className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 font-mono"
                >
                  {token}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function extractTokens(text: string): string[] {
  const matches = text.match(/\{[a-zA-Z]+\}/g)
  if (!matches) return []
  return [...new Set(matches)]
}
