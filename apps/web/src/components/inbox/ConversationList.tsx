'use client'

import { useState, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Search, Phone, MessageSquare, FileText, Inbox } from 'lucide-react'
import type { ConversationRow } from '@/lib/inbox'
import type { ChannelFilter } from '@/lib/inbox'

const FILTER_TABS: { key: ChannelFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'ALL', label: 'All', icon: <Inbox className="w-3.5 h-3.5" /> },
  { key: 'SMS', label: 'SMS', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { key: 'CALL', label: 'Calls', icon: <Phone className="w-3.5 h-3.5" /> },
  { key: 'NOTE', label: 'Notes', icon: <FileText className="w-3.5 h-3.5" /> },
]

function getContactName(row: ConversationRow): string {
  const pc = row.property?.contacts?.[0]?.contact
  if (pc) {
    const name = [pc.firstName, pc.lastName].filter(Boolean).join(' ')
    if (name) return name
  }
  return row.contactPhone ?? 'Unknown Contact'
}

function getPropertyAddress(row: ConversationRow): string {
  if (!row.property) return ''
  const parts = [row.property.streetAddress]
  if (row.property.city) {
    parts.push(row.property.city + (row.property.state ? `, ${row.property.state}` : ''))
  }
  return parts.filter(Boolean).join(' - ')
}

function getLastMessagePreview(row: ConversationRow): string {
  const msg = row.messages?.[0]
  if (!msg) return 'No messages yet'
  return msg.body?.slice(0, 80) ?? 'No content'
}

function getStatusBadge(row: ConversationRow): { label: string; className: string } | null {
  if (!row.property) return null
  const status = row.property.propertyStatus
  const map: Record<string, { label: string; className: string }> = {
    LEAD: { label: 'Lead', className: 'bg-blue-50 text-blue-700' },
    IN_TM: { label: 'TM', className: 'bg-purple-50 text-purple-700' },
    IN_INVENTORY: { label: 'Inventory', className: 'bg-amber-50 text-amber-700' },
    IN_DISPO: { label: 'Dispo', className: 'bg-orange-50 text-orange-700' },
    SOLD: { label: 'Sold', className: 'bg-green-50 text-green-700' },
    RENTAL: { label: 'Rental', className: 'bg-blue-50 text-blue-700' },
    DEAD: { label: 'Dead', className: 'bg-gray-100 text-gray-500' },
  }
  return map[status] ?? null
}

function getUnreadCount(row: ConversationRow): number {
  if (row.isRead) return 0
  return row._count.messages
}

interface Props {
  rows: ConversationRow[]
  selectedPropertyId?: string | null
  onSelect: (propertyId: string) => void
}

export function ConversationList({ rows, selectedPropertyId, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ChannelFilter>('ALL')

  const filtered = useMemo(() => {
    let items = rows

    // Channel filter: check if the latest message matches
    if (activeFilter !== 'ALL') {
      items = items.filter((row) => {
        const lastMsg = row.messages?.[0]
        if (!lastMsg) return false
        if (activeFilter === 'CALL') return lastMsg.channel === 'CALL'
        if (activeFilter === 'SMS') return lastMsg.channel === 'SMS'
        if (activeFilter === 'NOTE') return lastMsg.channel === 'NOTE'
        return true
      })
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((row) => {
        const name = getContactName(row).toLowerCase()
        const addr = getPropertyAddress(row).toLowerCase()
        const phone = row.contactPhone?.toLowerCase() ?? ''
        return name.includes(q) || addr.includes(q) || phone.includes(q)
      })
    }

    return items
  }, [rows, activeFilter, search])

  const totalUnread = rows.filter((r) => !r.isRead).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Inbox</h2>
          {totalUnread > 0 && (
            <span className="text-[10px] font-semibold bg-blue-600 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {totalUnread}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          {rows.length} conversation{rows.length !== 1 ? 's' : ''}
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts, addresses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 flex-shrink-0">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
              activeFilter === tab.key
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conversation Items */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <Inbox className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-xs text-gray-400">
              {search ? 'No matching conversations' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          filtered.map((row) => {
            const propertyId = row.property?.id ?? row.id
            const isSelected = propertyId === selectedPropertyId
            const isUnread = !row.isRead
            const unreadCount = getUnreadCount(row)
            const badge = getStatusBadge(row)
            const contactName = getContactName(row)
            const address = row.property?.streetAddress ?? ''
            const preview = getLastMessagePreview(row)
            const lastMsg = row.messages?.[0]

            return (
              <button
                key={row.id}
                onClick={() => onSelect(propertyId)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-gray-50 transition-colors',
                  isSelected
                    ? 'bg-blue-50 border-l-2 border-l-blue-600'
                    : 'hover:bg-gray-50 border-l-2 border-l-transparent',
                  isUnread && !isSelected && 'bg-blue-50/30',
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar circle */}
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold',
                      isUnread
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600',
                    )}
                  >
                    {contactName.charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-sm truncate',
                          isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700',
                        )}
                      >
                        {contactName}
                      </span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center flex-shrink-0">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>

                    {address && (
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">
                        {address}
                      </p>
                    )}

                    {badge && (
                      <span
                        className={cn(
                          'inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-1',
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p
                        className={cn(
                          'text-[11px] truncate',
                          isUnread ? 'text-gray-700 font-medium' : 'text-gray-400',
                        )}
                      >
                        {preview}
                      </p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {lastMsg?.createdAt
                          ? formatDistanceToNow(new Date(lastMsg.createdAt), { addSuffix: false })
                          : row.lastMessageAt
                            ? formatDistanceToNow(new Date(row.lastMessageAt), { addSuffix: false })
                            : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
