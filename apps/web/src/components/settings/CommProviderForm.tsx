'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Copy, Check, Webhook } from 'lucide-react'
import { toast } from 'sonner'

type ProviderName = 'twilio' | 'telnyx' | 'signalhouse'

interface ProviderAvailable {
  name: ProviderName
  label: string
}

interface ProviderConfigRow {
  providerName: ProviderName
  isActive: boolean
  defaultNumber: string
  enableCallCost: boolean
  config: Record<string, string>
}

const PROVIDER_LABELS: Record<ProviderName, string> = {
  twilio: 'Twilio',
  telnyx: 'Telnyx',
  signalhouse: 'Signal House',
}

/* ─────────────────────────────────────────────────────────────────────────
 * What each provider's UNIFIED webhook actually needs from this form.
 * The webhook handler reads these fields from CommProviderConfig at request
 * time to verify signatures + attribute messages. Anything marked "required
 * for webhooks" must be filled in before production traffic flows.
 * ─────────────────────────────────────────────────────────────────────── */
const WEBHOOK_NEEDS: Record<ProviderName, { paste: string[]; need: string[] }> = {
  twilio: {
    paste: [
      'Phone Numbers → <number> → Messaging Webhook',
      'Phone Numbers → <number> → Voice Webhook',
    ],
    need: [
      'Auth Token (HMAC-SHA1 signs every request — required to verify)',
      'Public Webhook Host (Twilio signs the URL it called — must match)',
    ],
  },
  telnyx: {
    paste: [
      'Messaging → Messaging Profile → Inbound Webhook URL',
      'Voice → Voice API & Apps → <app> → Webhook URL',
    ],
    need: [
      'Public Key (ed25519 — required to verify inbound webhook signatures)',
      'Messaging Profile ID (used to attribute outbound SMS to the right campaign)',
    ],
  },
  signalhouse: {
    paste: [
      'Messaging Settings → Inbound Webhook URL',
    ],
    need: [
      'Webhook Secret (HMAC — required to verify inbound webhooks)',
    ],
  },
}

export function CommProviderForm() {
  const [availableProviders, setAvailableProviders] = useState<ProviderAvailable[]>([])
  const [providers, setProviders] = useState<ProviderConfigRow[]>([])
  const [selected, setSelected] = useState<ProviderName>('twilio')
  const [defaultNumber, setDefaultNumber] = useState('')
  const [enableCallCost, setEnableCallCost] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '')
  }, [])

  // Load all providers on mount
  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/comm-provider')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        const list: ProviderAvailable[] = json.availableProviders ?? []
        const rows: ProviderConfigRow[] = json.providers ?? []
        setAvailableProviders(list)
        setProviders(rows)
        const active = rows.find((r) => r.isActive) ?? rows[0]
        if (active) {
          setSelected(active.providerName)
          setDefaultNumber(active.defaultNumber ?? '')
          setEnableCallCost(!!active.enableCallCost)
          setFields({ ...active.config })
        }
      })
      .catch(() => toast.error('Failed to load provider settings'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  function handleProviderSwitch(newName: ProviderName) {
    setSelected(newName)
    const row = providers.find((r) => r.providerName === newName)
    setDefaultNumber(row?.defaultNumber ?? '')
    setEnableCallCost(!!row?.enableCallCost)
    setFields({ ...(row?.config ?? {}) })
  }

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/comm-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerName: selected,
          defaultNumber,
          enableCallCost,
          config: fields,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Save failed')
      }
      toast.success('Provider configuration saved')
      const reload = await fetch('/api/settings/comm-provider').then((r) => r.json())
      setProviders(reload.providers ?? [])
      const active = (reload.providers ?? []).find((r: ProviderConfigRow) => r.isActive)
      if (active) {
        setFields({ ...active.config })
        setEnableCallCost(!!active.enableCallCost)
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/settings/comm-provider/test', { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.ok) {
        toast.success(`Connection OK${json.accountFriendlyName ? ` — ${json.accountFriendlyName}` : ''}`)
      } else {
        toast.error(json.error ?? 'Connection test failed')
      }
    } catch {
      toast.error('Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading provider settings…
      </div>
    )
  }

  const activeName = providers.find((r) => r.isActive)?.providerName
  // Prefer the operator-saved Public Webhook URL when set — that's the
  // URL Telnyx is actually configured to call. Auto-derived from page
  // origin only as a fallback so the diagnostic comparison and the
  // copy panel stay accurate even when running behind a tunnel.
  const derivedUrl = origin ? `${origin}/api/webhooks/${selected}` : ''
  const savedUrl = (fields.webhookUrl ?? '').trim()
  const webhookUrl = savedUrl || derivedUrl

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        {/* Active badge */}
        {activeName && (
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded">
              <CheckCircle2 className="w-3 h-3" />
              Active: {PROVIDER_LABELS[activeName]}
            </span>
          </div>
        )}

        {/* Provider dropdown */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
          <select
            value={selected}
            onChange={(e) => handleProviderSwitch(e.target.value as ProviderName)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableProviders.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Default outbound number */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Default Outbound Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={defaultNumber}
            onChange={(e) => setDefaultNumber(e.target.value)}
            placeholder="+15551234567"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[11px] text-gray-400 mt-1">E.164 format — used as the default sender for calls, SMS, and drips.</p>
        </div>

        {/* Enable Call Cost toggle */}
        <div className="mb-4">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableCallCost}
              onChange={(e) => setEnableCallCost(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <span className="text-sm font-medium text-gray-800">Enable Call Cost</span>
            <span
              title="When on, the per-call cost reported by the provider (Telnyx via call.hangup payload + CDR fallback) is captured on every ActiveCall and surfaced in the call activity feed."
              className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-[10px] font-bold cursor-help"
            >
              ?
            </span>
          </label>
          <p className="text-[11px] text-gray-400 mt-1">
            Capture per-call cost from {PROVIDER_LABELS[selected]} on hangup and show it in the call activity feed.
            {selected !== 'telnyx' && (
              <span className="text-amber-600 ml-1">
                ({PROVIDER_LABELS[selected]} cost capture is not yet wired — currently only Telnyx is supported.)
              </span>
            )}
          </p>
        </div>

        {/* Provider-specific credential fields */}
        {selected === 'twilio' && (
          <>
            <FieldRow
              label="Account SID *"
              value={fields.accountSid ?? ''}
              onChange={(v) => setField('accountSid', v)}
              mono
              hint="Found in Twilio Console → Account Info."
            />
            <FieldRow
              label="Auth Token *"
              value={fields.authToken ?? ''}
              onChange={(v) => setField('authToken', v)}
              type="password"
              hint="Used for outbound API auth AND inbound webhook signature verification (HMAC-SHA1). Clear to enter a new token; leave masked dots to keep existing."
            />
            <FieldRow
              label="Public Webhook Host *"
              value={fields.twimlHost ?? ''}
              onChange={(v) => setField('twimlHost', v)}
              placeholder={origin || 'https://your-domain.com'}
              hint="The public URL where this CRM is reachable. Twilio signs the URL it called and we verify against this — they MUST match. For local dev, paste your ngrok URL (e.g. https://abc.ngrok-free.dev)."
            />
          </>
        )}

        {selected === 'telnyx' && (
          <>
            <FieldRow
              label="API Key *"
              value={fields.apiKey ?? ''}
              onChange={(v) => setField('apiKey', v)}
              type="password"
              hint="V2 API key from Telnyx Mission Control → API Keys. Used for outbound API calls. Clear to enter a new one."
            />
            <FieldRow
              label="Messaging Profile ID *"
              value={fields.messagingProfileId ?? ''}
              onChange={(v) => setField('messagingProfileId', v)}
              mono
              hint="UUID of your Messaging Profile (Telnyx → Messaging → Messaging Profiles). Required for outbound SMS routing through your 10DLC campaign."
            />
            <FieldRow
              label="Voice Application ID *"
              value={fields.voiceApplicationId ?? ''}
              onChange={(v) => setField('voiceApplicationId', v)}
              mono
              hint="ID of your Voice API Application (Telnyx → Voice → Voice API & Apps → Applications). Required for outbound calls — your numbers must be assigned to this application. The CRM also uses this same ID as the SIP Connection ID for minting WebRTC login tokens (a Voice API App in Telnyx is a credential connection, so its ID serves both roles)."
            />
            <FieldRow
              label="Public Key *"
              value={fields.publicKey ?? ''}
              onChange={(v) => setField('publicKey', v)}
              mono
              hint="Required for production. Telnyx signs every inbound webhook with ed25519 — without this key, signatures cannot be verified. Mission Control → Developers → Webhook Signing → copy the Public Key (base64)."
            />
            <FieldRow
              label="Public Webhook URL"
              value={fields.webhookUrl ?? ''}
              onChange={(v) => setField('webhookUrl', v)}
              placeholder={origin ? `${origin}/api/webhooks/telnyx` : 'https://your-domain.com/api/webhooks/telnyx'}
              hint="The URL you pasted into Telnyx Messaging Profile + Voice API App. Stored here for your records — the CRM derives the webhook endpoint from this host. Leave blank to use the auto-detected origin."
            />
          </>
        )}

        {selected === 'signalhouse' && (
          <>
            <FieldRow
              label="API Token *"
              value={fields.apiToken ?? ''}
              onChange={(v) => setField('apiToken', v)}
              type="password"
              hint="Clear to enter a new token."
            />
            <FieldRow
              label="Account ID *"
              value={fields.accountId ?? ''}
              onChange={(v) => setField('accountId', v)}
              mono
            />
            <FieldRow
              label="Webhook Secret"
              value={fields.webhookSecret ?? ''}
              onChange={(v) => setField('webhookSecret', v)}
              type="password"
              hint="Optional today — Signal House inbound webhook handler is not yet implemented. Will be required once HMAC verification is wired up."
            />
          </>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors active:scale-95"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !activeName || activeName !== selected}
            title={activeName !== selected ? 'Save first to activate this provider, then test.' : 'Test connection'}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Test Connection
          </button>
        </div>

        {activeName && activeName !== selected && (
          <div className="flex items-start gap-1.5 mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Saving will switch the active provider from{' '}
            <strong>{PROVIDER_LABELS[activeName]}</strong> to{' '}
            <strong>{PROVIDER_LABELS[selected]}</strong>.
          </div>
        )}
      </div>

      {/* ─── Webhook URL panel ───────────────────────────────────────── */}
      <WebhookPanel providerName={selected} webhookUrl={webhookUrl} />

      {/* ─── Inbound diagnostic (Telnyx-only for now) ─────────────────── */}
      {selected === 'telnyx' && (
        <TelnyxInboundDiagnostic webhookUrl={webhookUrl} />
      )}
    </div>
  )
}

/**
 * "Verify Telnyx Setup" panel.
 *
 * One-click hits /api/diagnostics/telnyx-inbound and renders the three
 * checks the inbound-call path depends on:
 *   • Voice API Application exists in the saved Telnyx account
 *   • Webhook URL on that App matches our current tunnel/host
 *   • Each phone number is assigned to the App via connection_id
 *
 * Most "the call rang my cell phone but never hit the CRM" issues are
 * one of these three — surfacing them as a checklist gives the operator
 * a clear next step without digging through Mission Control.
 */
function TelnyxInboundDiagnostic({ webhookUrl }: { webhookUrl: string }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const url = webhookUrl
        ? `/api/diagnostics/telnyx-inbound?expectedWebhook=${encodeURIComponent(webhookUrl)}`
        : '/api/diagnostics/telnyx-inbound'
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? `Diagnostic failed (${res.status})`)
      } else {
        setResult(json)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Diagnostic failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Verify Telnyx Inbound Setup</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Pings Telnyx to confirm your Voice App, webhook URL, and number assignments
            — fixes the &ldquo;call didn&apos;t reach the CRM&rdquo; case.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-1.5 border border-gray-200 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {running && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Run Verification
        </button>
      </div>

      {error && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {result?.checks && (
        <ul className="space-y-2">
          {(['appExists', 'webhookMatch', 'numbersAssigned', 'messagingProfile', 'reachability', 'signatureKey'] as const).map((key) => {
            const c = result.checks[key] as { ok: boolean; message: string; numbers?: any[] } | undefined
            if (!c) return null
            const labels: Record<string, string> = {
              appExists: 'Voice Application',
              webhookMatch: 'Voice Webhook URL',
              numbersAssigned: 'Phone Number Assignment',
              messagingProfile: 'Messaging Profile (SMS)',
              reachability: 'Webhook URL Reachability',
              signatureKey: 'Signature Verification',
            }
            return (
              <li
                key={key}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
                  c.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                }`}
              >
                <span
                  className={`text-base leading-none mt-0.5 ${
                    c.ok ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {c.ok ? '✓' : '!'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">{labels[key]}</p>
                  <p className="text-[11px] text-gray-700 mt-0.5">{c.message}</p>
                  {key === 'numbersAssigned' && c.numbers && c.numbers.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {c.numbers.map((n: any) => (
                        <div key={n.number} className="text-[11px] font-mono flex items-center gap-2">
                          <span className={n.assigned ? 'text-emerald-700' : 'text-amber-700'}>
                            {n.assigned ? '✓' : '✗'}
                          </span>
                          <span className="text-gray-700">{n.number}</span>
                          {!n.assigned && (
                            <span className="text-[10px] text-gray-500">
                              (currently on {n.connectionId ?? 'no'} connection)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function WebhookPanel({
  providerName,
  webhookUrl,
}: {
  providerName: ProviderName
  webhookUrl: string
}) {
  const [copied, setCopied] = useState(false)
  const needs = WEBHOOK_NEEDS[providerName]

  async function copy() {
    if (!webhookUrl) return
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      toast.success('Webhook URL copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select the URL manually')
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Webhook className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-800">
          Unified Webhook URL — {PROVIDER_LABELS[providerName]}
        </h3>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        One URL handles both SMS and Voice. Paste this into both webhook fields in your{' '}
        {PROVIDER_LABELS[providerName]} dashboard.
      </p>

      {/* The URL with copy button */}
      <div className="flex items-center gap-2 mb-4">
        <code className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 break-all">
          {webhookUrl || 'Loading…'}
        </code>
        <button
          onClick={copy}
          disabled={!webhookUrl}
          className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Where to paste it */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Paste in {PROVIDER_LABELS[providerName]}:
        </p>
        <ul className="text-xs text-gray-700 space-y-1">
          {needs.paste.map((spot) => (
            <li key={spot} className="flex items-start gap-1.5">
              <span className="text-gray-400">•</span>
              <span>{spot}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* What this webhook needs from us */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Required for inbound webhooks to work:
        </p>
        <ul className="text-xs text-gray-700 space-y-1">
          {needs.need.map((req) => (
            <li key={req} className="flex items-start gap-1.5">
              <span className="text-gray-400">•</span>
              <span>{req}</span>
            </li>
          ))}
        </ul>
      </div>

      {webhookUrl && webhookUrl.startsWith('http://') && (
        <div className="flex items-start gap-1.5 mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Twilio + Telnyx require <strong>HTTPS</strong>. Use the <code className="px-1 bg-amber-100 rounded">pnpm tunnel</code> command to get a public HTTPS URL for local testing.
          </span>
        </div>
      )}
    </div>
  )
}

function FieldRow({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
  mono?: boolean
}) {
  // When the field holds the masked-secret placeholder, show a small
  // "Replace" button so it's obvious how to re-enter a value (the
  // unaware user can't tell whether the dots represent the existing
  // secret or a literal value).
  const isMasked = value === '••••••••'
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''} ${isMasked ? 'pr-20' : ''}`}
        />
        {isMasked && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-[10px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors"
            title="Clear so you can paste a new value"
          >
            Replace
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{hint}</p>}
    </div>
  )
}
