'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import type { UnreadNotification } from '@/lib/notifications'
import { formatDistanceToNow } from 'date-fns'

const TYPE_ICON: Record<string, string> = {
  NEW_LEAD: '🏠',
  MESSAGE_RECEIVED: '💬',
  TASK_DUE: '✅',
  STAGE_CHANGE: '🔄',
  MENTION: '@',
  SYSTEM: '⚙️',
}

interface Props {
  initialNotifications: UnreadNotification[]
}

export function NotificationBell({ initialNotifications }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)

  const unreadCount = notifications.length

  async function markAllRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setNotifications([])
    router.refresh()
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className="relative w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4 text-gray-500" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] bg-red-500 rounded-full border border-white flex items-center justify-center text-[9px] font-bold text-white px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <span className="text-[13px] font-semibold text-gray-900">
                Notifications {unreadCount > 0 && <span className="text-gray-400">({unreadCount})</span>}
              </span>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium transition-colors">
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                All caught up!
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{n.title}</p>
                      {n.body && <p className="text-[11px] text-gray-500 truncate">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <button onClick={() => markRead(n.id)} className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
