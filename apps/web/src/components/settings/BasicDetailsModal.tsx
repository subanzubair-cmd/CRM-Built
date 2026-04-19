'use client'

import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { UserRow } from './UsersList'
import { COUNTRY_CODES, DEFAULT_COUNTRY } from '@/lib/country-codes'

interface Props {
  open: boolean
  user: UserRow
  onClose: () => void
  onSave: (updated: { name: string; email: string; phone: string | null }) => void
}

export function BasicDetailsModal({ open, user, onClose, onSave }: Props) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      const nameParts = user.name.split(' ')
      setFirstName(nameParts[0] || '')
      setLastName(nameParts.slice(1).join(' ') || '')
      setEmail(user.email)
      setPhone(user.phone || '')
      setError('')
    }
  }, [open, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) { setError('First name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (!phone.trim()) { setError('Phone number is required'); return }

    setSaving(true)
    setError('')
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const dialCode = COUNTRY_CODES.find((c) => c.value === country)?.code ?? '+1'
      const fullPhone = `${dialCode} ${phone.trim()}`
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName,
          email: email.trim(),
          phone: fullPhone,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save')
      }
      onSave({
        name: fullName,
        email: email.trim(),
        phone: fullPhone,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-blue-600 rounded-t-xl">
          <h2 className="text-[15px] font-semibold text-white">Edit Basic Details</h2>
          <button
            onClick={onClose}
            className="text-blue-100 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Last name"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Phone <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[130px]"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={`${c.value}-${c.code}`} value={c.value}>
                    {c.code} {c.label}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || !firstName.trim() || !email.trim() || !phone.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors active:scale-95 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Basic Details
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
