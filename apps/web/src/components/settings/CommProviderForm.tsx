'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
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
  config: Record<string, string>
}

export function CommProviderForm() {
  const [availableProviders, setAvailableProviders] = useState<ProviderAvailable[]>([])
  const [providers, setProviders] = useState<ProviderConfigRow[]>([])
  const [selected, setSelected] = useState<ProviderName>('twilio')
  const [defaultNumber, setDefaultNumber] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

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
          setFields({ ...active.config })
        }
      })
      .catch(() => toast.error('Failed to load provider settings'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Switching provider — load that row's fields
  function handleProviderSwitch(newName: ProviderName) {
    setSelected(newName)
    const row = providers.find((r) => r.providerName === newName)
    setDefaultNumber(row?.defaultNumber ?? '')
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
          config: fields,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Save failed')
      }
      toast.success('Provider configuration saved')
      // Reload to show masked values
      const reload = await fetch('/api/settings/comm-provider').then((r) => r.json())
      setProviders(reload.providers ?? [])
      const active = (reload.providers ?? []).find((r: ProviderConfigRow) => r.isActive)
      if (active) setFields({ ...active.config })
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

  return (
    <div className="max-w-xl">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        {/* Active badge */}
        {activeName && (
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded">
              <CheckCircle2 className="w-3 h-3" />
              Active: {availableProviders.find((p) => p.name === activeName)?.label ?? activeName}
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

        {/* Provider-specific fields */}
        {selected === 'twilio' && (
          <>
            <FieldRow label="Account SID *" value={fields.accountSid ?? ''} onChange={(v) => setField('accountSid', v)} mono />
            <FieldRow label="Auth Token *" value={fields.authToken ?? ''} onChange={(v) => setField('authToken', v)} type="password" hint="Clear to enter a new token — leave masked dots to keep existing." />
            <FieldRow label="TwiML Host" value={fields.twimlHost ?? ''} onChange={(v) => setField('twimlHost', v)} placeholder="https://your-domain.com" />
          </>
        )}

        {selected === 'telnyx' && (
          <>
            <FieldRow label="API Key *" value={fields.apiKey ?? ''} onChange={(v) => setField('apiKey', v)} type="password" hint="V2 API key — clear to enter a new one." />
            <FieldRow label="Messaging Profile ID" value={fields.messagingProfileId ?? ''} onChange={(v) => setField('messagingProfileId', v)} mono />
            <FieldRow label="Public Key" value={fields.publicKey ?? ''} onChange={(v) => setField('publicKey', v)} mono hint="Optional — used for webhook signature verification." />
          </>
        )}

        {selected === 'signalhouse' && (
          <>
            <FieldRow label="API Token *" value={fields.apiToken ?? ''} onChange={(v) => setField('apiToken', v)} type="password" hint="Clear to enter a new token." />
            <FieldRow label="Account ID *" value={fields.accountId ?? ''} onChange={(v) => setField('accountId', v)} mono />
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
            Saving will switch the active provider from <strong>{availableProviders.find((p) => p.name === activeName)?.label}</strong> to <strong>{availableProviders.find((p) => p.name === selected)?.label}</strong>.
          </div>
        )}
      </div>
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
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`}
      />
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
