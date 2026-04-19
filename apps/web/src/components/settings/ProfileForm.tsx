'use client'

import { useState } from 'react'

interface Props {
  initialName: string
  initialPhone: string
  email: string
}

export function ProfileForm({ initialName, initialPhone, email }: Props) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-md">
      <h3 className="text-[13px] font-semibold text-gray-900 mb-4">Profile</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Email</label>
          <input value={email} disabled
            className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Full Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 2145550100"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={saving || !name.trim()}
          className="bg-blue-600 text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
