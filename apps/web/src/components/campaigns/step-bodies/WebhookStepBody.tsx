'use client'

/**
 * Webhook body editor — img035 in the spec. Just a URL input + a help
 * line. The payload is implicit: the executor POSTs `{ campaignId,
 * stepId, enrollmentId, subjectType, subjectId, ... }` — no payload
 * editor needed.
 */

type Config = { actionType: 'WEBHOOK'; url: string }

export function WebhookStepBody({
  config,
  onChange,
}: {
  config: Config
  onChange: (next: Config) => void
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        Post URL
      </label>
      <input
        type="url"
        value={config.url}
        onChange={(e) => onChange({ ...config, url: e.target.value })}
        placeholder="https://example.com/webhook"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-[11px] text-gray-400">
        URL with http:// or https://. The CRM will POST a JSON payload
        containing campaign, step, enrollment, and subject identifiers.
      </p>
    </div>
  )
}
