'use client'

/**
 * StepEditor — replaces the old `AddStepForm`. Drives the spec's
 * per-step authoring shape: delay (number + unit), action-type
 * dropdown, then a per-action body. The action types reflect what the
 * customer's REsimpli walkthrough actually offers, minus the four
 * channels we're explicitly skipping (Direct Mail, RVM, Outbound
 * Voice AI, SMS Assist).
 *
 * Each action's `config` is a discriminated union — we only mutate
 * the slice for the currently selected actionType, then post the
 * whole envelope to /api/campaigns/[id]/steps where Zod
 * (`StepFieldsSchema`) re-validates it.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CampaignStep } from './CampaignStepCard'
import { DelayUnitSelect } from './DelayUnitSelect'
import { SmsStepBody } from './step-bodies/SmsStepBody'
import { EmailStepBody } from './step-bodies/EmailStepBody'
import { TaskStepBody } from './step-bodies/TaskStepBody'
import { WebhookStepBody } from './step-bodies/WebhookStepBody'
import { TagChangeStepBody } from './step-bodies/TagChangeStepBody'
import { StatusChangeStepBody } from './step-bodies/StatusChangeStepBody'
import { DripEnrollStepBody } from './step-bodies/DripEnrollStepBody'

export type ActionType =
  | 'SMS'
  | 'EMAIL'
  | 'TASK'
  | 'WEBHOOK'
  | 'TAG_CHANGE'
  | 'STATUS_CHANGE'
  | 'DRIP_ENROLL'

const ACTION_TYPES: Array<{ value: ActionType; label: string }> = [
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'TASK', label: 'Task' },
  { value: 'WEBHOOK', label: 'Webhook Trigger' },
  { value: 'TAG_CHANGE', label: 'Tags' },
  { value: 'STATUS_CHANGE', label: 'Status Change' },
  { value: 'DRIP_ENROLL', label: 'Drip Campaign' },
]

const DELAY_UNITS = ['MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS'] as const

function defaultConfigFor(action: ActionType): any {
  switch (action) {
    case 'SMS':
      return { actionType: 'SMS', body: '', recipientScope: 'PRIMARY' }
    case 'EMAIL':
      return {
        actionType: 'EMAIL',
        fromName: '',
        fromEmail: '',
        subject: '',
        body: '',
        attachments: [],
      }
    case 'TASK':
      return {
        actionType: 'TASK',
        priority: 'NONE',
        title: '',
        detail: '',
        reminders: [],
      }
    case 'WEBHOOK':
      return { actionType: 'WEBHOOK', url: '' }
    case 'TAG_CHANGE':
      return { actionType: 'TAG_CHANGE', addTags: [], removeTags: [] }
    case 'STATUS_CHANGE':
      return {
        actionType: 'STATUS_CHANGE',
        targetStatus: '',
        pendingTaskHandling: 'KEEP_PENDING',
      }
    case 'DRIP_ENROLL':
      return { actionType: 'DRIP_ENROLL', targetCampaignId: '' }
  }
}

interface Props {
  campaignId: string
  campaignModule: 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD'
  editingStep: CampaignStep | null
  onSaved: () => void
  onCancel: () => void
}

export function StepEditor({
  campaignId,
  campaignModule,
  editingStep,
  onSaved,
  onCancel,
}: Props) {
  const isEditing = !!editingStep

  const [actionType, setActionType] = useState<ActionType>('SMS')
  const [delayAmount, setDelayAmount] = useState(0)
  const [delayUnit, setDelayUnit] = useState<(typeof DELAY_UNITS)[number]>('MINUTES')
  const [skipWeekends, setSkipWeekends] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [config, setConfig] = useState<any>(defaultConfigFor('SMS'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hydrate from editingStep on open / step swap.
  useEffect(() => {
    if (editingStep) {
      const at = (editingStep.actionType ??
        editingStep.channel ??
        'SMS') as ActionType
      setActionType(at)
      setDelayAmount(
        editingStep.delayAmount ??
          (editingStep.delayDays ?? 0) * 24 + (editingStep.delayHours ?? 0),
      )
      setDelayUnit(
        (editingStep.delayUnit as (typeof DELAY_UNITS)[number]) ?? 'HOURS',
      )
      setSkipWeekends(editingStep.skipWeekendsAndHolidays ?? false)
      setIsActive(editingStep.isActive)
      // The persisted config may have been written before this UI
      // existed (legacy SMS rows), so fall back to a default shell of
      // the correct discriminator.
      const cfg = (editingStep.config as any) ?? defaultConfigFor(at)
      setConfig(cfg.actionType === at ? cfg : { ...defaultConfigFor(at), ...cfg, actionType: at })
    } else {
      setActionType('SMS')
      setDelayAmount(0)
      setDelayUnit('MINUTES')
      setSkipWeekends(false)
      setIsActive(true)
      setConfig(defaultConfigFor('SMS'))
    }
  }, [editingStep])

  // When the user swaps the action type, reset config to that shape's
  // defaults — keeps the route's discriminated-union validator happy.
  function handleActionTypeChange(next: ActionType) {
    setActionType(next)
    setConfig(defaultConfigFor(next))
  }

  // Per-action validation that mirrors what the API will enforce —
  // we surface the failure inline before sending, so the user isn't
  // left guessing why "Save" was a no-op.
  function localValidate(): string | null {
    switch (actionType) {
      case 'SMS':
        if (!config.body?.trim()) return 'Message body is required.'
        return null
      case 'EMAIL':
        if (!config.fromName?.trim()) return 'From Name is required.'
        if (!config.fromEmail?.trim()) return 'From Email is required.'
        if (!config.subject?.trim()) return 'Subject is required.'
        if (!config.body?.trim()) return 'Email body is required.'
        return null
      case 'TASK':
        if (!config.title?.trim()) return 'Task title is required.'
        return null
      case 'WEBHOOK':
        if (!config.url?.trim()) return 'Webhook URL is required.'
        if (!/^https?:\/\//i.test(config.url))
          return 'URL must start with http:// or https://'
        return null
      case 'TAG_CHANGE':
        if (
          (config.addTags?.length ?? 0) + (config.removeTags?.length ?? 0) ===
          0
        )
          return 'Add or remove at least one tag.'
        return null
      case 'STATUS_CHANGE':
        if (!config.targetStatus) return 'Pick a target status.'
        return null
      case 'DRIP_ENROLL':
        if (!config.targetCampaignId)
          return 'Pick a target drip campaign to enroll into.'
        return null
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const localErr = localValidate()
    if (localErr) {
      setError(localErr)
      return
    }
    setError(null)
    setSaving(true)

    try {
      const payload = {
        actionType,
        delayAmount,
        delayUnit,
        skipWeekendsAndHolidays: skipWeekends,
        isActive,
        config: { ...config, actionType },
      }
      const url = isEditing
        ? `/api/campaigns/${campaignId}/steps/${editingStep!.id}`
        : `/api/campaigns/${campaignId}/steps`
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(
          typeof errBody.error === 'string'
            ? errBody.error
            : 'Failed to save step.',
        )
      }
      toast.success(isEditing ? 'Step updated.' : 'Step added.')
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const showSkipToggle = useMemo(
    () =>
      // STATUS_CHANGE / TAG_CHANGE / DRIP_ENROLL fire instantly and
      // don't have a "send" concept — the weekend-skip toggle would
      // be confusing on those, so the spec only shows it for the
      // outbound + task actions.
      ['SMS', 'EMAIL', 'TASK', 'WEBHOOK'].includes(actionType),
    [actionType],
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-gray-100">
        <h4 className="text-[13px] font-semibold text-gray-900">
          {isEditing ? 'Edit Step' : 'Add New Step'}
        </h4>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Delay (number + unit) */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Delay before this step executes
          </label>
          <DelayUnitSelect
            amount={delayAmount}
            unit={delayUnit}
            onChange={(next) => {
              setDelayAmount(next.amount)
              setDelayUnit(next.unit as (typeof DELAY_UNITS)[number])
            }}
          />
          {delayAmount === 0 && (
            <p className="mt-1 text-[11px] text-gray-400 italic">
              Fires immediately when the previous step completes.
            </p>
          )}
        </div>

        {/* Action type */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            What marketing action would you like to trigger
          </label>
          <select
            value={actionType}
            onChange={(e) => handleActionTypeChange(e.target.value as ActionType)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ACTION_TYPES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* Per-action body */}
        <div className="border-t border-gray-100 pt-4">
          {actionType === 'SMS' && (
            <SmsStepBody config={config} onChange={setConfig} />
          )}
          {actionType === 'EMAIL' && (
            <EmailStepBody config={config} onChange={setConfig} />
          )}
          {actionType === 'TASK' && (
            <TaskStepBody config={config} onChange={setConfig} />
          )}
          {actionType === 'WEBHOOK' && (
            <WebhookStepBody config={config} onChange={setConfig} />
          )}
          {actionType === 'TAG_CHANGE' && (
            <TagChangeStepBody config={config} onChange={setConfig} />
          )}
          {actionType === 'STATUS_CHANGE' && (
            <StatusChangeStepBody
              config={config}
              onChange={setConfig}
              campaignModule={campaignModule}
            />
          )}
          {actionType === 'DRIP_ENROLL' && (
            <DripEnrollStepBody
              config={config}
              onChange={setConfig}
              campaignId={campaignId}
              campaignModule={campaignModule}
            />
          )}
        </div>

        {/* Skip weekends + holidays — applies only to "send"-style steps */}
        {showSkipToggle && (
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipWeekends}
              onChange={(e) => setSkipWeekends(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[12px] text-gray-600 leading-relaxed">
              Skip this step on weekend and public holidays.
              <span
                className="ml-1 text-gray-400"
                title="If the step's fire time lands on Sat / Sun or a US public holiday, it'll be pushed to 9 AM the next business day, and any subsequent steps re-anchor on the new fire time."
              >
                ⓘ
              </span>
            </span>
          </label>
        )}

        {/* Active toggle (edit mode) */}
        {isEditing && (
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-600">Step is active</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isActive ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isActive ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving
              ? isEditing
                ? 'Saving...'
                : 'Adding...'
              : isEditing
                ? 'Save Changes'
                : 'Add Step'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
