'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const CONTACT_TYPES = [
  { value: 'SELLER', label: 'Seller' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'AGENT', label: 'Agent' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'OTHER', label: 'Other' },
]

const inputCls =
  'w-full mt-0.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

const PREFERRED_CHANNELS = [
  { value: '', label: 'No preference' },
  { value: 'CALL', label: 'Call' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'OTHER', label: 'Other' },
]

interface ContactData {
  contactId: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  contactType: string
  role: string | null
  isPrimary: boolean
  doNotCall: boolean
  doNotText: boolean
  preferredChannel: string | null
}

interface Props {
  propertyId: string
  contact: ContactData
  onClose: () => void
  onSaved: () => void
}

export function EditContactModal({ propertyId, contact, onClose, onSaved }: Props) {
  const [firstName, setFirstName] = useState(contact.firstName)
  const [lastName, setLastName] = useState(contact.lastName ?? '')
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [contactType, setContactType] = useState(contact.contactType)
  const [role, setRole] = useState(contact.role ?? '')
  const [isPrimary, setIsPrimary] = useState(contact.isPrimary)
  const [doNotCall, setDoNotCall] = useState(contact.doNotCall)
  const [doNotText, setDoNotText] = useState(contact.doNotText)
  const [preferredChannel, setPreferredChannel] = useState(contact.preferredChannel ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) {
      setError('First name is required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        `/api/properties/${propertyId}/contacts/${contact.contactId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            contactType,
            role: role.trim() || null,
            isPrimary,
            doNotCall,
            doNotText,
            preferredChannel: preferredChannel || null,
          }),
        },
      )
      if (!res.ok) throw new Error('Failed')
      onSaved()
    } catch {
      setError('Failed to save contact. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Edit Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">First Name *</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">Type</label>
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value)}
                className={inputCls}
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Role</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Owner"
                className={inputCls}
              />
            </div>
          </div>
          {/* Compliance toggles */}
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide">Compliance</p>
            <label className="flex items-center justify-between text-sm text-gray-700 cursor-pointer">
              <span>Do Not Call</span>
              <button
                type="button"
                role="switch"
                aria-checked={doNotCall}
                onClick={() => setDoNotCall(!doNotCall)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${doNotCall ? 'bg-red-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${doNotCall ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between text-sm text-gray-700 cursor-pointer">
              <span>Do Not Text</span>
              <button
                type="button"
                role="switch"
                aria-checked={doNotText}
                onClick={() => setDoNotText(!doNotText)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${doNotText ? 'bg-red-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${doNotText ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <div>
              <label className="text-[11px] text-gray-500">Preferred Channel</label>
              <select
                value={preferredChannel}
                onChange={(e) => setPreferredChannel(e.target.value)}
                className={inputCls}
              >
                {PREFERRED_CHANNELS.map((ch) => (
                  <option key={ch.value} value={ch.value}>{ch.label}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded border-gray-300"
            />
            Set as primary contact
          </label>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
