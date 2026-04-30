'use client'

import { useEffect, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { VariablePicker } from '../VariablePicker'
import { DelayUnitSelect } from '../DelayUnitSelect'

/**
 * Task body editor — matches img031..img034 in the spec. Shape:
 *   - Role responsible (dropdown of roles that have at least one user)
 *   - Priority (None / Low / Normal / High / Urgent)
 *   - Title + Detail textareas (with @ variable picker on Title)
 *   - Reminders[] table — each row is `{ via, amount, unit }`
 *
 * The reminder rows fan out into BullMQ scheduled jobs at execution
 * time (`task.dueAt - reminder.offset`) — see drip-executor's
 * handleTaskStep. We don't validate reminders here beyond shape; the
 * route + executor handle the rest.
 */

type Role = { id: string; name: string }

type Reminder = {
  via: 'SMS' | 'EMAIL'
  amount: number
  unit: 'MINUTES' | 'HOURS' | 'DAYS' | 'WEEKS' | 'MONTHS'
}

type Config = {
  actionType: 'TASK'
  assigneeRoleId?: string | null
  assigneeUserId?: string | null
  priority: 'NONE' | 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  title: string
  detail: string
  reminders: Reminder[]
}

const PRIORITIES: Array<{ value: Config['priority']; label: string; color: string }> = [
  { value: 'NONE', label: 'None Priority', color: 'text-gray-500' },
  { value: 'LOW', label: 'Low', color: 'text-sky-600' },
  { value: 'NORMAL', label: 'Normal', color: 'text-emerald-600' },
  { value: 'HIGH', label: 'High', color: 'text-amber-600' },
  { value: 'URGENT', label: 'Urgent', color: 'text-rose-600' },
]

export function TaskStepBody({
  config,
  onChange,
}: {
  config: Config
  onChange: (next: Config) => void
}) {
  const [roles, setRoles] = useState<Role[]>([])

  useEffect(() => {
    let aborted = false
    // ?withUsers=true filters to roles with at least one active
    // user — surfacing empty-shell roles in this dropdown means a
    // Task step gets assigned to nobody.
    fetch('/api/roles?withUsers=true')
      .then((r) => r.json())
      .then((res) => {
        if (aborted) return
        // The roles endpoint historically returns either { data } or
        // a bare array — accept either to avoid a future-shape surprise.
        const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []
        setRoles(list.map((r: any) => ({ id: r.id, name: r.name })))
      })
      .catch(() => {})
    return () => {
      aborted = true
    }
  }, [])

  function updateReminder(i: number, patch: Partial<Reminder>) {
    onChange({
      ...config,
      reminders: config.reminders.map((r, idx) =>
        idx === i ? { ...r, ...patch } : r,
      ),
    })
  }

  function addReminder() {
    onChange({
      ...config,
      reminders: [
        ...config.reminders,
        { via: 'SMS', amount: 30, unit: 'MINUTES' },
      ],
    })
  }

  function removeReminder(i: number) {
    onChange({ ...config, reminders: config.reminders.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Which role will be responsible for this task
          </label>
          <select
            value={config.assigneeRoleId ?? ''}
            onChange={(e) =>
              onChange({ ...config, assigneeRoleId: e.target.value || null })
            }
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Choose a role —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Task Priority
          </label>
          <select
            value={config.priority}
            onChange={(e) =>
              onChange({ ...config, priority: e.target.value as Config['priority'] })
            }
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <VariablePicker
        label="Task Title"
        value={config.title}
        onChange={(v) => onChange({ ...config, title: v })}
        rows={2}
        placeholder="e.g. Follow up with @{{firstName}}"
      />

      <VariablePicker
        label="Task Detail"
        value={config.detail}
        onChange={(v) => onChange({ ...config, detail: v })}
        rows={4}
        placeholder="Notes, talking points, or links to context."
      />

      {/* Reminders */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Reminders
        </label>
        {config.reminders.length === 0 && (
          <p className="text-[12px] text-gray-400 italic mb-2">
            No reminders set. Add one below to ping the assignee
            ahead of the task's due time.
          </p>
        )}
        <div className="space-y-2">
          {config.reminders.map((r, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 px-3 py-2 border border-gray-100 rounded-lg bg-gray-50"
            >
              <span className="text-[11px] text-gray-500 font-medium w-20">
                Remind via
              </span>
              <select
                value={r.via}
                onChange={(e) =>
                  updateReminder(i, { via: e.target.value as Reminder['via'] })
                }
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
              </select>
              <span className="text-[11px] text-gray-500 font-medium ml-2">
                Remind before
              </span>
              <DelayUnitSelect
                amount={r.amount}
                unit={r.unit}
                onChange={(next) => updateReminder(i, { amount: next.amount, unit: next.unit as Reminder['unit'] })}
                numberAsSelect
              />
              <button
                type="button"
                onClick={() => removeReminder(i)}
                className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                title="Remove reminder"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addReminder}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-4 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Reminder
        </button>
      </div>
    </div>
  )
}
