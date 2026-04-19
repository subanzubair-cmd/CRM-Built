'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { LogOut, Loader2, X } from 'lucide-react'

interface Props {
  open: boolean
  userName: string
  onClose: () => void
}

export function SignOutConfirmModal({ open, userName, onClose }: Props) {
  const [signingOut, setSigningOut] = useState(false)

  if (!open) return null

  async function handleSignOut() {
    setSigningOut(true)
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-red-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Sign Out</h2>
          </div>
          <button
            onClick={onClose}
            disabled={signingOut}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 text-sm text-gray-700">
          <p>
            Are you sure you want to sign out, <strong>{userName}</strong>?
          </p>
          <p className="text-xs text-gray-500 mt-2">
            You will need to sign in again to access the CRM.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            disabled={signingOut}
            className="px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors active:scale-95 disabled:opacity-50"
          >
            {signingOut && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
