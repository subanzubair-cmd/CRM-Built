'use client'

import { useEffect, useState } from 'react'
import { VariablePicker } from '../VariablePicker'

/**
 * SMS body editor — matches img025/img026 in the spec:
 *   - "Your SMS will be sent from your campaign number" helper line
 *   - Recipient scope radio (Primary / All contacts)
 *   - Template picker (read-only — selecting copies into the body)
 *   - Body textarea with @-trigger variable picker
 *
 * The hidden "SMS Assist" toggle from REsimpli is intentionally
 * omitted; we don't ship that feature.
 */

type SmsTemplate = { id: string; name: string; bodyContent: string }

type Config = {
  actionType: 'SMS'
  templateId?: string | null
  body: string
  recipientScope: 'PRIMARY' | 'ALL'
}

export function SmsStepBody({
  config,
  onChange,
}: {
  config: Config
  onChange: (next: Config) => void
}) {
  const [templates, setTemplates] = useState<SmsTemplate[]>([])

  useEffect(() => {
    let aborted = false
    fetch('/api/templates?type=sms')
      .then((r) => r.json())
      .then((res) => {
        if (aborted) return
        const list = Array.isArray(res?.data) ? res.data : []
        setTemplates(
          list
            .filter((t: any) => t.isActive !== false)
            .map((t: any) => ({ id: t.id, name: t.name, bodyContent: t.bodyContent })),
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
    onChange({ ...config, templateId: id, body: tpl.bodyContent })
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-gray-500 italic">
        Your SMS will be sent from your campaign number.
      </p>

      {/* Recipient scope */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Select Contact
        </label>
        <div className="flex items-center gap-4">
          {(['PRIMARY', 'ALL'] as const).map((scope) => (
            <label
              key={scope}
              className="flex items-center gap-1.5 text-[13px] cursor-pointer"
            >
              <input
                type="radio"
                name="sms-recipient-scope"
                value={scope}
                checked={config.recipientScope === scope}
                onChange={() => onChange({ ...config, recipientScope: scope })}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">
                {scope === 'PRIMARY' ? 'Primary Contact' : 'All Contacts'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Template picker */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Choose the message from templates
        </label>
        <select
          value={config.templateId ?? ''}
          onChange={(e) => applyTemplate(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Choose a template —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Body */}
      <VariablePicker
        label="Message Text"
        value={config.body}
        onChange={(v) => onChange({ ...config, body: v, templateId: null })}
        rows={4}
        placeholder="type @ for variable fields"
        hint="Type @ to insert merge variables like the contact's first name."
      />
    </div>
  )
}
