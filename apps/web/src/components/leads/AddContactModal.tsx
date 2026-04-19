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

const PREFERRED_CHANNELS = [
  { value: '', label: 'No preference' },
  { value: 'CALL', label: 'Call' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'OTHER', label: 'Other' },
]

const inputCls =
  'w-full mt-0.5 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

interface Props {
  propertyId: string
  onClose: () => void
  onAdded: () => void
}

export function AddContactModal({ propertyId, onClose, onAdded }: Props) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [contactType, setContactType] = useState('SELLER')
  const [role, setRole] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)
  const [preferredChannel, setPreferredChannel] = useState('')
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
      const res = await fetch(`/api/properties/${propertyId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          contactType,
          role: role.trim() || null,
          isPrimary,
          preferredChannel: preferredChannel || null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      onAdded()
    } catch {
      setError('Failed to add contact. Please try again.')
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
          <h2 className="text-base font-semibold text-gray-900">Add Contact</h2>
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
              {saving ? 'Adding…' : 'Add Contact'}
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
