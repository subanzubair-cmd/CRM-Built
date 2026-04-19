'use client'

import Link from 'next/link'
import {
  ExternalLink,
  User,
  MapPin,
  Phone,
  Mail,
  CheckSquare,
  MessageSquare,
  Building2,
  Loader2,
} from 'lucide-react'
import type { ConversationContext as ContextType } from '@/lib/inbox'

function getDetailUrl(p: ContextType): string {
  switch (p.propertyStatus) {
    case 'IN_TM':
      return `/tm/${p.id}`
    case 'IN_INVENTORY':
      return `/inventory/${p.id}`
    case 'IN_DISPO':
      return `/dispo/${p.id}`
    case 'SOLD':
      return `/sold/${p.id}`
    case 'RENTAL':
      return `/rental/${p.id}`
    default:
      return `/leads/${p.leadType === 'DIRECT_TO_AGENT' ? 'dta' : 'dts'}/${p.id}`
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ')
}

const STATUS_COLORS: Record<string, string> = {
  LEAD: 'bg-blue-50 text-blue-700',
  IN_TM: 'bg-purple-50 text-purple-700',
  IN_INVENTORY: 'bg-amber-50 text-amber-700',
  IN_DISPO: 'bg-orange-50 text-orange-700',
  SOLD: 'bg-green-50 text-green-700',
  RENTAL: 'bg-blue-50 text-blue-700',
  DEAD: 'bg-gray-100 text-gray-500',
}

interface Props {
  context: ContextType | null
  loading?: boolean
}

export function ConversationContext({ context, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
      </div>
    )
  }

  if (!context) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Building2 className="w-8 h-8 text-gray-200 mb-2" />
        <p className="text-xs text-gray-400">
          Property details will appear here when you select a conversation
        </p>
      </div>
    )
  }

  const detailUrl = getDetailUrl(context)
  const addressLine = [context.city, context.state, context.zip].filter(Boolean).join(', ')
  const primaryContact = context.contacts?.[0]?.contact
  const statusColor = STATUS_COLORS[context.propertyStatus] ?? 'bg-gray-100 text-gray-600'

  return (
    <div className="p-4 space-y-5">
      {/* Contact Info Section */}
      {primaryContact && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {primaryContact.firstName?.charAt(0)?.toUpperCase() ?? 'C'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {[primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' ')}
              </p>
              <p className="text-[11px] text-gray-500 capitalize">
                {context.contacts[0]?.contact?.type?.toLowerCase() ?? 'contact'}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            {primaryContact.phone && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{primaryContact.phone}</span>
              </div>
            )}
            {primaryContact.email && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{primaryContact.email}</span>
              </div>
            )}
          </div>

          {/* Additional contacts */}
          {context.contacts.length > 1 && (
            <p className="text-[11px] text-gray-400 mt-2">
              +{context.contacts.length - 1} more contact{context.contacts.length - 1 !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      <div className="h-px bg-gray-100" />

      {/* Property Info Section */}
      <div>
        <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Associated Lead
        </h4>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            {context.streetAddress ?? 'Unknown Property'}
          </p>
          {addressLine && (
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {addressLine}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor}`}>
              {formatStatus(context.propertyStatus)}
            </span>
            {context.tmStage && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                TM: {formatStatus(context.tmStage)}
              </span>
            )}
            {context.inventoryStage && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                Inv: {formatStatus(context.inventoryStage)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="h-px bg-gray-100" />

      {/* Stats Section */}
      <div>
        <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Activity
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <CheckSquare className="w-4 h-4 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-gray-900">{context._count.tasks}</p>
            <p className="text-[10px] text-gray-500">Open Tasks</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <MessageSquare className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-lg font-semibold text-gray-900">{context._count.messages}</p>
            <p className="text-[10px] text-gray-500">Messages</p>
          </div>
        </div>
      </div>

      {/* Assigned To */}
      {context.assignedTo?.name && (
        <>
          <div className="h-px bg-gray-100" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Assigned To
            </span>
            <span className="text-xs font-medium text-gray-800">{context.assignedTo.name}</span>
          </div>
        </>
      )}

      {/* View Full Record Button */}
      <Link
        href={detailUrl}
        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        View Full Record
      </Link>
    </div>
  )
}
