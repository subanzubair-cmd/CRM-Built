'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

type PipelineScope = 'dts' | 'dta' | 'both'

type AccessToLeads = 'all' | 'assigned'
type AccessType = 'view' | 'full'

const DTS_STAGES = [
  { key: 'NEW_LEAD', label: 'New Leads' },
  { key: 'DISCOVERY', label: 'Discovery' },
  { key: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested / Follow-up' },
  { key: 'APPOINTMENT_MADE', label: 'Appointment Made' },
  { key: 'DUE_DILIGENCE', label: 'Due Diligence' },
  { key: 'OFFER_MADE', label: 'Offer Made' },
  { key: 'OFFER_FOLLOW_UP', label: 'Offer Follow-up' },
  { key: 'UNDER_CONTRACT', label: 'Under Contract' },
]

const DTA_STAGES = [
  { key: 'NEW_LEAD', label: 'New Leads' },
  { key: 'DISCOVERY', label: 'Discovery' },
  { key: 'INTERESTED_ADD_TO_FOLLOW_UP', label: 'Interested / Follow-up' },
  { key: 'DUE_DILIGENCE', label: 'Due Diligence' },
  { key: 'OFFER_MADE', label: 'Offer Made' },
  { key: 'OFFER_FOLLOW_UP', label: 'Offer Follow-up' },
  { key: 'UNDER_CONTRACT', label: 'Under Contract' },
]

const EXIT_STAGES = [
  { key: 'WARM', label: 'Warm Lead' },
  { key: 'REFERRED_TO_AGENT', label: 'Referred To Agent' },
  { key: 'DEAD', label: 'Dead Lead' },
]

const ACTION_PERMS = [
  { key: 'delete', label: 'Access to Delete Leads' },
  { key: 'export', label: 'Access to Export Leads' },
  { key: 'dispo_tab', label: 'Access to Dispo Tab in Leads' },
  { key: 'assign_unassigned', label: 'Access to assign Unassigned Leads to other team members' },
  { key: 'assign_unclaimed', label: 'Access to assign Unclaimed Leads to other team members' },
]

interface Props {
  open: boolean
  initialPermissions: string[]
  onClose: () => void
  onSave: (permissions: string[]) => void
}

/**
 * Builds a permission key. Convention:
 *   leads.{scope}.{category}.{value}
 * scope = dts | dta
 * category = access (all|assigned|view|full), stage.{STAGE}, action.{NAME}
 */
function permKey(scope: 'dts' | 'dta', segment: string): string {
  return `leads.${scope}.${segment}`
}

function hasPerm(perms: Set<string>, scope: 'dts' | 'dta', segment: string): boolean {
  return perms.has(permKey(scope, segment))
}

export function LeadPermissionsModal({ open, initialPermissions, onClose, onSave }: Props) {
  const [tab, setTab] = useState<'assigned' | 'permissions'>('assigned')
  const [scope, setScope] = useState<PipelineScope>('both')
  const [perms, setPerms] = useState<Set<string>>(new Set(initialPermissions))

  if (!open) return null

  const activeScopes: ('dts' | 'dta')[] = scope === 'both' ? ['dts', 'dta'] : [scope]

  function togglePerm(segment: string, on: boolean) {
    const next = new Set(perms)
    for (const s of activeScopes) {
      const key = permKey(s, segment)
      if (on) next.add(key)
      else next.delete(key)
    }
    setPerms(next)
  }

  function isOn(segment: string): boolean {
    // "on" if all active scopes have the permission
    return activeScopes.every((s) => hasPerm(perms, s, segment))
  }

  function setAccessToLeads(value: AccessToLeads) {
    const next = new Set(perms)
    for (const s of activeScopes) {
      // Remove both, add the chosen one
      next.delete(permKey(s, 'access.all'))
      next.delete(permKey(s, 'access.assigned'))
      next.add(permKey(s, `access.${value}`))
    }
    setPerms(next)
  }

  function setAccessType(value: AccessType) {
    const next = new Set(perms)
    for (const s of activeScopes) {
      next.delete(permKey(s, 'type.view'))
      next.delete(permKey(s, 'type.full'))
      next.add(permKey(s, `type.${value}`))
    }
    setPerms(next)
  }

  const accessToLeads: AccessToLeads = activeScopes.every((s) => hasPerm(perms, s, 'access.assigned')) ? 'assigned' : 'all'
  const accessType: AccessType = activeScopes.every((s) => hasPerm(perms, s, 'type.view')) ? 'view' : 'full'

  // Combine DTS + DTA stages deduped by key
  const stagesForScope = scope === 'dts' ? DTS_STAGES
    : scope === 'dta' ? DTA_STAGES
    : DTS_STAGES // "Both" uses DTS list (superset of DTA)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-blue-600 rounded-t-2xl">
          <h2 className="text-base font-semibold text-white">Lead Permissions</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pipeline scope */}
        <div className="px-5 pt-3 pb-1 border-b border-gray-100">
          <div className="flex gap-2">
            {(['dts', 'dta', 'both'] as PipelineScope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  scope === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s === 'both' ? 'DTS + DTA' : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-5">
          <div className="flex gap-6">
            <button
              onClick={() => setTab('assigned')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === 'assigned' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Assigned
            </button>
            <button
              onClick={() => setTab('permissions')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === 'permissions' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Permissions
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'assigned' ? (
            <>
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">Access To Leads</p>
              <div className="space-y-2 mb-4">
                <RadioRow label="All Leads" checked={accessToLeads === 'all'} onChange={() => setAccessToLeads('all')} />
                <RadioRow label="Assigned Leads" checked={accessToLeads === 'assigned'} onChange={() => setAccessToLeads('assigned')} />
              </div>

              <p className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">Access Type</p>
              <div className="space-y-2 mb-4">
                <RadioRow label="View Only leads" checked={accessType === 'view'} onChange={() => setAccessType('view')} />
                <RadioRow label="Full Access" checked={accessType === 'full'} onChange={() => setAccessType('full')} />
              </div>

              <p className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">Access Permission By Status</p>
              <div className="space-y-2">
                {stagesForScope.map((s) => (
                  <ToggleRow
                    key={s.key}
                    label={s.label}
                    checked={isOn(`stage.${s.key}`)}
                    onChange={(v) => togglePerm(`stage.${s.key}`, v)}
                  />
                ))}
                <div className="border-t border-gray-100 my-2" />
                {EXIT_STAGES.map((s) => (
                  <ToggleRow
                    key={s.key}
                    label={s.label}
                    checked={isOn(`stage.${s.key}`)}
                    onChange={(v) => togglePerm(`stage.${s.key}`, v)}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">Permissions</p>
              <div className="space-y-2">
                {ACTION_PERMS.map((a) => (
                  <ToggleRow
                    key={a.key}
                    label={a.label}
                    checked={isOn(`action.${a.key}`)}
                    onChange={(v) => togglePerm(`action.${a.key}`, v)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave([...perms])
              onClose()
            }}
            className="flex-1 bg-blue-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-blue-700 transition-colors active:scale-95"
          >
            Save Lead Access
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Reusable rows ─── */

function RadioRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-gray-800">{label}</span>
    </label>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-1">
      <span className="text-sm text-gray-800 flex-1">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
      <span className={`ml-2 text-xs font-medium w-8 ${checked ? 'text-blue-600' : 'text-gray-400'}`}>
        {checked ? 'Yes' : 'No'}
      </span>
    </label>
  )
}
