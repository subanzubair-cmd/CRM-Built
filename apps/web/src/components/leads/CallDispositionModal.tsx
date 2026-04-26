'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone,
  X,
  CheckCircle2,
  RefreshCw,
  PhoneForwarded,
  Paperclip,
  Calendar,
  ListTodo,
  Zap,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'

/* ── Outcome constants (shared with CallOutcomeModal) ── */

const CONNECTED_OUTCOMES = [
  { value: 'appointment_set', label: 'Appt Set' },
  { value: 'offer_made', label: 'Offer Made' },
  { value: 'moved_to_dead', label: 'Moved to Dead Lead' },
  { value: 'moved_to_warm', label: 'Moved to Warm Lead' },
  { value: 'moved_to_referred', label: 'Moved to Referred To Agent' },
  { value: 'other_connected', label: 'Other' },
]

const NOT_CONNECTED_OUTCOMES = [
  { value: 'left_voicemail', label: 'Left VM and/or SMS' },
  { value: 'moved_to_dead_nc', label: 'Moved to Dead Lead' },
  { value: 'moved_to_warm_nc', label: 'Moved to Warm Lead' },
  { value: 'moved_to_referred_nc', label: 'Moved to Referred To Agent' },
  { value: 'other_not_connected', label: 'Other' },
]

const STATUS_CHANGES: Record<string, string> = {
  moved_to_dead: 'DEAD',
  moved_to_warm: 'WARM',
  moved_to_referred: 'REFERRED_TO_AGENT',
  moved_to_dead_nc: 'DEAD',
  moved_to_warm_nc: 'WARM',
  moved_to_referred_nc: 'REFERRED_TO_AGENT',
}

const STAGE_CHANGES: Record<string, string> = {
  appointment_set: 'APPOINTMENT_MADE',
  offer_made: 'OFFER_MADE',
}

/* ── Types ── */

interface ContactOption {
  id: string
  name: string
  phone: string
  email?: string | null
  type?: string
}

interface TwilioNumber {
  id: string
  number: string
  friendlyName: string | null
}

interface SmsTemplate {
  id: string
  name: string
  body: string
}

interface TaskItem {
  id: string
  title: string
  status: string
}

interface Props {
  propertyId: string
  propertyAddress: string
  contacts: ContactOption[]
  selectedContact: ContactOption
  callId: string | null
  callStartedAt: Date
  pipeline: string
  nextLeadId: string | null
  onClose: () => void
  onCallNext: (nextLeadId: string) => void
  onRedial: () => void
}

function getTomorrowDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function CallDispositionModal({
  propertyId,
  propertyAddress,
  contacts,
  selectedContact,
  callId,
  callStartedAt,
  pipeline,
  nextLeadId,
  onClose,
  onCallNext,
  onRedial,
}: Props) {
  const router = useRouter()

  /* ── Column 1: SMS state ── */
  const [smsContactId, setSmsContactId] = useState(selectedContact.id)
  const [smsFrom, setSmsFrom] = useState('')
  const [smsTemplateId, setSmsTemplateId] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsSent, setSmsSent] = useState(false)
  const [twilioNumbers, setTwilioNumbers] = useState<TwilioNumber[]>([])
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([])

  /* ── Column 2: Tasks & Actions state ── */
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState(
    `Follow up on call with ${selectedContact.name}`
  )
  const [newTaskDueDate, setNewTaskDueDate] = useState(getTomorrowDate())
  const [showAddAppt, setShowAddAppt] = useState(false)
  const [apptDate, setApptDate] = useState('')
  const [apptTime, setApptTime] = useState('')
  const [apptType, setApptType] = useState('PHONE_CALL')

  /* ── Column 3: Call Outcome state ── */
  const [notes, setNotes] = useState('')
  const [callResult, setCallResult] = useState<string | null>(null)
  const [enterReason, setEnterReason] = useState('')
  const [saving, setSaving] = useState(false)

  /* ── Duration display ── */
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const tick = () => {
      setElapsed(Math.floor((Date.now() - callStartedAt.getTime()) / 1000))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [callStartedAt])

  const durationLabel =
    elapsed < 60
      ? `${elapsed}s`
      : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`

  /* ── Fetch Twilio numbers on mount ── */
  useEffect(() => {
    fetch('/api/twilio-numbers')
      .then((r) => r.json())
      .then((json) => {
        const nums: TwilioNumber[] = json.data ?? []
        setTwilioNumbers(nums)
        if (nums.length > 0) setSmsFrom(nums[0].number)
      })
      .catch(() => {})
  }, [])

  /* ── Fetch SMS templates on mount ── */
  useEffect(() => {
    fetch('/api/templates?type=sms')
      .then((r) => r.json())
      .then((json) => {
        const raw = json.data ?? []
        setSmsTemplates(
          raw.map((t: any) => ({
            id: t.id,
            name: t.name,
            body: t.bodyContent ?? t.body ?? '',
          }))
        )
      })
      .catch(() => {})
  }, [])

  /* ── Fetch tasks on mount ── */
  useEffect(() => {
    setTasksLoading(true)
    fetch(`/api/tasks?propertyId=${propertyId}&status=PENDING`)
      .then((r) => r.json())
      .then((json) => {
        setTasks(
          (json.data ?? []).map((t: any) => ({
            id: t.id,
            title: t.title,
            status: t.status,
          }))
        )
      })
      .catch(() => {})
      .finally(() => setTasksLoading(false))
  }, [propertyId])

  /* ── SMS template selection ── */
  function handleTemplateChange(templateId: string) {
    setSmsTemplateId(templateId)
    const tpl = smsTemplates.find((t) => t.id === templateId)
    if (tpl) setSmsMessage(tpl.body)
  }

  /* ── Send SMS ── */
  async function handleSendSms() {
    if (!smsMessage.trim()) return
    const contact = contacts.find((c) => c.id === smsContactId) ?? selectedContact
    if (!contact.phone) return

    setSmsSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          channel: 'SMS',
          direction: 'OUTBOUND',
          body: smsMessage,
          to: contact.phone,
          from: smsFrom || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to send SMS')
      setSmsSent(true)
      toast.success('SMS sent successfully')
      setTimeout(() => setSmsSent(false), 3000)
    } catch {
      toast.error('Failed to send SMS')
    } finally {
      setSmsSending(false)
    }
  }

  /* ── Complete task ── */
  async function handleCompleteTask(taskId: string) {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      })
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'COMPLETED' } : t))
      )
    } catch {
      toast.error('Failed to complete task')
    }
  }

  /* ── Save new task ── */
  async function handleSaveTask() {
    if (!newTaskTitle.trim()) return
    try {
      const res = await fetch(`/api/leads/${propertyId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          type: 'FOLLOW_UP',
          dueDate: newTaskDueDate,
        }),
      })
      if (!res.ok) throw new Error('Failed to create task')
      const json = await res.json()
      const created = json.data ?? json
      setTasks((prev) => [
        ...prev,
        { id: created.id, title: created.title ?? newTaskTitle, status: 'PENDING' },
      ])
      setShowAddTask(false)
      setNewTaskTitle(`Follow up on call with ${selectedContact.name}`)
      setNewTaskDueDate(getTomorrowDate())
      toast.success('Task created')
    } catch {
      toast.error('Failed to create task')
    }
  }

  /* ── Save appointment ── */
  async function handleSaveAppt() {
    if (!apptDate || !apptTime) return
    const typeLabels: Record<string, string> = {
      PHONE_CALL: 'Phone Call',
      IN_PERSON: 'In-Person',
      VIRTUAL: 'Virtual',
    }
    const startAt = new Date(`${apptDate}T${apptTime}:00`).toISOString()
    const endAt = new Date(
      new Date(`${apptDate}T${apptTime}:00`).getTime() + 60 * 60 * 1000
    ).toISOString()

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          title: `${typeLabels[apptType] ?? apptType} with ${selectedContact.name}`,
          startAt,
          endAt,
        }),
      })
      if (!res.ok) throw new Error('Failed to create appointment')
      setShowAddAppt(false)
      setApptDate('')
      setApptTime('')
      toast.success('Appointment created')
    } catch {
      toast.error('Failed to create appointment')
    }
  }

  /* ── Call result selection (clear the other column) ── */
  function handleSelectResult(value: string) {
    setCallResult(value)
  }

  /* ── Save all disposition data ── */
  const saveAllDisposition = useCallback(async (): Promise<boolean> => {
    if (!callResult && !notes.trim()) return true

    const outcomeLabel =
      [...CONNECTED_OUTCOMES, ...NOT_CONNECTED_OUTCOMES].find(
        (o) => o.value === callResult
      )?.label ?? ''
    const isConnected = CONNECTED_OUTCOMES.some((o) => o.value === callResult)
    const connLabel = callResult
      ? isConnected
        ? 'LEAD CONNECTED'
        : 'LEAD NOT-CONNECTED'
      : ''
    const durationSecs = Math.floor(
      (Date.now() - callStartedAt.getTime()) / 1000
    )
    const durLabel =
      durationSecs < 60
        ? `${durationSecs}s`
        : `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s`

    // Fetch per-call cost from ActiveCall (populated by the Telnyx
    // call.hangup webhook + CDR fallback). By the time the agent
    // submits the disposition, the cost is usually present. If the
    // race loses (cost not yet posted), we save without it — the row
    // is still in the DB and a future feature could backfill the
    // activity log entry once cost lands.
    let costLabel: string | null = null
    if (callId) {
      try {
        const res = await fetch(`/api/calls/${callId}/cost`)
        if (res.ok) {
          const j = (await res.json()) as { cost: number | null; costCurrency: string | null }
          if (j.cost != null) {
            // Sub-cent calls show 4 decimals; otherwise 2.
            const fixed = j.cost < 0.01 ? j.cost.toFixed(4) : j.cost.toFixed(2)
            const isUsd = (j.costCurrency ?? 'USD') === 'USD'
            costLabel = isUsd ? `$${fixed}` : `${fixed} ${j.costCurrency}`
          }
        }
      } catch {
        // Silent — proceed without cost.
      }
    }

    const bodyParts = [
      connLabel && `${connLabel} (${outcomeLabel})`,
      enterReason,
      notes.trim(),
      `(${durLabel}${costLabel ? ` · ${costLabel}` : ''})`,
    ].filter(Boolean)

    try {
      // 1. Log call outcome
      if (bodyParts.length > 1) {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId,
            channel: 'CALL',
            direction: 'OUTBOUND',
            body: bodyParts.join(' \u2014 '),
          }),
        })
      }

      // 2. Update lead status/stage if needed
      const patchData: Record<string, string> = {}
      if (callResult && STATUS_CHANGES[callResult])
        patchData.leadStatus = STATUS_CHANGES[callResult]
      if (callResult && STAGE_CHANGES[callResult])
        patchData.activeLeadStage = STAGE_CHANGES[callResult]
      if (Object.keys(patchData).length > 0) {
        void fetch(`/api/leads/${propertyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchData),
        })
      }

      return true
    } catch {
      return false
    }
  }, [callResult, notes, enterReason, callStartedAt, propertyId])

  /* ── Button handlers ── */
  async function handleExitDialing() {
    setSaving(true)
    await saveAllDisposition()
    router.refresh()
    onClose()
  }

  async function handleRedial() {
    setSaving(true)
    await saveAllDisposition()
    router.refresh()
    onRedial()
  }

  async function handleCallNext() {
    if (!nextLeadId) return
    setSaving(true)
    await saveAllDisposition()
    router.refresh()
    onCallNext(nextLeadId)
  }

  /* ── Derived ── */
  const smsContact =
    contacts.find((c) => c.id === smsContactId) ?? selectedContact
  const pendingTasks = tasks.filter((t) => t.status === 'PENDING')
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] mx-4 max-h-[90vh] flex flex-col">
        {/* ── Top Bar ── */}
        <div className="bg-blue-700 rounded-t-2xl px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">
              {propertyAddress}
            </h2>
            <p className="text-xs text-blue-200 mt-0.5">
              {selectedContact.name} &middot; {selectedContact.phone}
            </p>
          </div>
          <button
            onClick={handleExitDialing}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <X className="w-4 h-4" />
            Exit Dialing
          </button>
        </div>

        {/* ── 3-Column Body ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* ── Column 1: SEND SMS ── */}
          <div className="flex-1 p-5 overflow-y-auto border-r border-gray-200">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Send SMS
            </h3>

            {/* Send To */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Send To
              </label>
              <select
                value={smsContactId}
                onChange={(e) => setSmsContactId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors bg-white"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} &middot; ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            {/* SMS Template */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                SMS Template
              </label>
              <select
                value={smsTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors bg-white"
              >
                <option value="">Select a template...</option>
                {smsTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Message
              </label>
              <textarea
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                placeholder="Type your SMS message..."
                rows={6}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
            </div>

            {/* Attachments placeholder */}
            <div className="mb-4">
              <button
                type="button"
                className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg px-4 py-2.5 hover:border-gray-400 hover:text-gray-800 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
                Add attachments
              </button>
            </div>

            {/* Send button */}
            <button
              onClick={handleSendSms}
              disabled={smsSending || !smsMessage.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-blue-600 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 active:scale-95"
            >
              {smsSent ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Sent!</span>
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4" />
                  {smsSending ? 'Sending...' : 'Send SMS'}
                </>
              )}
            </button>
          </div>

          {/* ── Column 2: TASKS & ACTIONS ── */}
          <div className="flex-1 p-5 overflow-y-auto border-r border-gray-200">
            {/* Tasks heading */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <ListTodo className="w-4 h-4" />
                My Assigned Tasks ({pendingTasks.length})
              </h3>
              <button
                onClick={() => setShowAddTask(!showAddTask)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Task
              </button>
            </div>

            {/* Add task form */}
            {showAddTask && (
              <div className="mb-4 border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder={`Follow up on call with ${selectedContact.name}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                />
                <div>
                  <label className="text-xs text-gray-500 mb-0.5 block">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTask}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors active:scale-95"
                  >
                    Save Task
                  </button>
                  <button
                    onClick={() => setShowAddTask(false)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Task list */}
            <div className="space-y-1.5 mb-4">
              {tasksLoading && (
                <p className="text-xs text-gray-400">Loading tasks...</p>
              )}
              {!tasksLoading && pendingTasks.length === 0 && (
                <p className="text-xs text-gray-400">No pending tasks</p>
              )}
              {pendingTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => handleCompleteTask(task.id)}
                    className="flex-shrink-0 text-gray-300 hover:text-emerald-500 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-800 truncate">
                    {task.title}
                  </span>
                </div>
              ))}
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 opacity-50">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-sm text-gray-500 line-through truncate">
                    {task.title}
                  </span>
                </div>
              ))}
            </div>

            {/* Activate Drip */}
            <button
              onClick={() => toast.info('Drip activation coming soon')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors mb-3"
            >
              <Zap className="w-4 h-4" />
              Activate Drip
            </button>

            {/* Add Appointment */}
            <button
              onClick={() => setShowAddAppt(!showAddAppt)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors mb-3"
            >
              <Calendar className="w-4 h-4" />
              Add Appt.
            </button>

            {showAddAppt && (
              <div className="border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-0.5 block">
                      Date
                    </label>
                    <input
                      type="date"
                      value={apptDate}
                      onChange={(e) => setApptDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-0.5 block">
                      Time
                    </label>
                    <input
                      type="time"
                      value={apptTime}
                      onChange={(e) => setApptTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-0.5 block">
                    Type
                  </label>
                  <select
                    value={apptType}
                    onChange={(e) => setApptType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors bg-white"
                  >
                    <option value="PHONE_CALL">Phone Call</option>
                    <option value="IN_PERSON">In-Person</option>
                    <option value="VIRTUAL">Virtual</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveAppt}
                    disabled={!apptDate || !apptTime}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 active:scale-95"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowAddAppt(false)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Column 3: CALL OUTCOME ── */}
          <div className="flex-1 p-5 overflow-y-auto flex flex-col">
            {/* Notes */}
            <div className="mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Notes
              </h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter your note and it will auto save once you click Call Next Contact or Stop Dialing"
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
            </div>

            {/* Call Result */}
            <div className="mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                Call Result
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Connected column */}
                <div>
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-2 py-0.5 rounded mb-2">
                    Lead Connected
                  </span>
                  <div className="space-y-1.5">
                    {CONNECTED_OUTCOMES.map((o) => (
                      <label
                        key={o.value}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <span
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            callResult === o.value
                              ? 'border-blue-600 bg-blue-600'
                              : 'border-gray-300 group-hover:border-gray-400'
                          }`}
                        >
                          {callResult === o.value && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </span>
                        <input
                          type="radio"
                          name="callResult"
                          value={o.value}
                          checked={callResult === o.value}
                          onChange={() => handleSelectResult(o.value)}
                          className="sr-only"
                        />
                        <span className="text-xs text-gray-700">{o.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Not Connected column */}
                <div>
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-100 px-2 py-0.5 rounded mb-2">
                    Lead Not Connected
                  </span>
                  <div className="space-y-1.5">
                    {NOT_CONNECTED_OUTCOMES.map((o) => (
                      <label
                        key={o.value}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <span
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            callResult === o.value
                              ? 'border-blue-600 bg-blue-600'
                              : 'border-gray-300 group-hover:border-gray-400'
                          }`}
                        >
                          {callResult === o.value && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </span>
                        <input
                          type="radio"
                          name="callResult"
                          value={o.value}
                          checked={callResult === o.value}
                          onChange={() => handleSelectResult(o.value)}
                          className="sr-only"
                        />
                        <span className="text-xs text-gray-700">{o.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Enter Reason */}
            {callResult && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Enter Reason
                </label>
                <input
                  type="text"
                  value={enterReason}
                  onChange={(e) => setEnterReason(e.target.value)}
                  placeholder="Reason for this outcome..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                />
              </div>
            )}

            {/* Duration */}
            <p className="text-xs text-gray-400 mb-4">
              Call duration: {durationLabel}
            </p>

            {/* Spacer to push buttons to bottom */}
            <div className="flex-1" />

            {/* Action buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handleRedial}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Redial
              </button>
              <button
                onClick={handleCallNext}
                disabled={saving || !nextLeadId}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 active:scale-95"
              >
                <PhoneForwarded className="w-4 h-4" />
                {saving ? 'Saving...' : 'Call Next Contact'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
