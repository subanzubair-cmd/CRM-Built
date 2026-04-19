'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, ChevronDown, LogOut, Shield, User } from 'lucide-react'
import { SignOutConfirmModal } from '@/components/auth/SignOutConfirmModal'

interface Props {
  name: string
  email: string
  initials: string
  avatarUrl?: string | null
}

export function ProfileMenu({ name, email, initials, avatarUrl }: Props) {
  const [open, setOpen] = useState(false)
  const [dndActive, setDndActive] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
        title={name}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
          {/* Header — user info */}
          <div className="flex items-start gap-3 px-4 py-4 bg-gray-50 border-b border-gray-100">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
              <p className="text-xs text-gray-500 truncate">{email}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                DND {dndActive ? 'Active' : 'Inactive'}
              </p>
            </div>
            <button
              onClick={() => setDndActive(!dndActive)}
              title={dndActive ? 'Disable Do Not Disturb' : 'Enable Do Not Disturb'}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors ${
                dndActive
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-white'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Menu items */}
          <nav className="py-1">
            <Link
              href="/settings?tab=users"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <User className="w-4 h-4 text-gray-500" />
              Profile
            </Link>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <Bell className="w-4 h-4 text-gray-500" />
              Notification
            </Link>
            <Link
              href="/settings?tab=two-factor"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <Shield className="w-4 h-4 text-gray-500" />
              Two Factor Authentication
            </Link>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => {
                setOpen(false)
                setSignOutOpen(true)
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </nav>
        </div>
      )}

      <SignOutConfirmModal
        open={signOutOpen}
        userName={name}
        onClose={() => setSignOutOpen(false)}
      />
    </div>
  )
}
