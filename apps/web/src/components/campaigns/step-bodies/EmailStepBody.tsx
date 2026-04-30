'use client'

import { useEffect, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { VariablePicker } from '../VariablePicker'

/**
 * Email body editor — matches img028/img029 in the spec.
 *
 * The spec shows that selecting an email template opens a modal where
 * From Name / From Email / Subject / Message / Attachments are
 * editable copies the user can override before saving. We collapse
 * that modal into the inline form for now — same fields, same
 * editability, less clicks. If a real "save back to template"
 * affordance is needed later, we can promote these fields into a
 * separate `EmailTemplateModal` without breaking the data shape.
 */

type EmailTemplate = {
  id: string
  name: string
  subject: string | null
  bodyContent: string
}

type Attachment = { name: string; url: string }

type Config = {
  actionType: 'EMAIL'
  templateId?: string | null
  fromName: string
  fromEmail: string
  subject: string
  body: string
  attachments: Attachment[]
}

export function EmailStepBody({
  config,
  onChange,
}: {
  config: Config
  onChange: (next: Config) => void
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])

  useEffect(() => {
    let aborted = false
    fetch('/api/templates?type=email')
      .then((r) => r.json())
      .then((res) => {
        if (aborted) return
        const list = Array.isArray(res?.data) ? res.data : []
        setTemplates(
          list
            .filter((t: any) => t.isActive !== false)
            .map((t: any) => ({
              id: t.id,
              name: t.name,
              subject: t.subject ?? null,
              bodyContent: t.bodyContent,
            })),
        )
      })
      .catch(() => {})
    return () => {
      aborted = true
    }
  }, [])

  function applyTemplate(id: string) {
    if (!id) {
      onChange({ ...config, templateId: null })
      return
    }
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    onChange({
      ...config,
      templateId: id,
      subject: tpl.subject ?? config.subject,
      body: tpl.bodyContent,
    })
  }

  function addAttachment() {
    const name = window.prompt('Attachment label (shown to recipient):')?.trim()
    if (!name) return
    const url = window.prompt('Attachment URL (must be publicly reachable):')?.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      alert('Attachment URL must start with http:// or https://')
      return
    }
    onChange({ ...config, attachments: [...config.attachments, { name, url }] })
  }

  function removeAttachment(idx: number) {
    onChange({
      ...config,
      attachments: config.attachments.filter((_, i) => i !== idx),
    })
  }

  return (
    <div className="space-y-4">
      {/* Template picker */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Email Template
        </label>
        <select
          value={config.templateId ?? ''}
          onChange={(e) => applyTemplate(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Choose a template (optional) —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-gray-400">
          Selecting a template fills the fields below — you can edit
          them for this step without changing the template itself.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            From Name
          </label>
          <input
            type="text"
            value={config.fromName}
            onChange={(e) => onChange({ ...config, fromName: e.target.value })}
            placeholder="Lead Manager"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            From Email
          </label>
          <input
            type="email"
            value={config.fromEmail}
            onChange={(e) => onChange({ ...config, fromEmail: e.target.value })}
            placeholder="lead@example.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Subject
        </label>
        <input
          type="text"
          value={config.subject}
          onChange={(e) => onChange({ ...config, subject: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <VariablePicker
        label="Message"
        value={config.body}
        onChange={(v) => onChange({ ...config, body: v })}
        rows={6}
        placeholder="Write the email body — type @ to insert merge variables."
      />

      {/* Attachments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Attachments
          </label>
          <button
            type="button"
            onClick={addAttachment}
            className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700 font-semibold"
          >
            <Paperclip className="w-3.5 h-3.5" />
            Add attachment
          </button>
        </div>
        {config.attachments.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">
            No attachments. We accept any publicly reachable URL.
          </p>
        ) : (
          <ul className="space-y-1">
            {config.attachments.map((a, i) => (
              <li
                key={`${a.url}-${i}`}
                className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[12px]"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Paperclip className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{a.name}</span>
                  <span className="text-gray-400 truncate">{a.url}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="text-gray-400 hover:text-red-500"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
