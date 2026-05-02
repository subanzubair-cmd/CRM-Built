'use client'

import { useState } from 'react'
import { Phone, MessageSquare, Mail } from 'lucide-react'
import { EntityCallPanel } from './EntityCallPanel'
import { EntitySendSmsModal } from './EntitySendSmsModal'
import { EntityComposeEmailModal } from './EntityComposeEmailModal'

interface ContactOption {
  id: string
  name: string
  phone?: string
  email?: string | null
  type?: string
}

interface Props {
  entityType: 'buyer' | 'vendor'
  entityId: string
  contacts: ContactOption[]
  label: string
}

export function EntityQuickActionBar({ entityType, entityId, contacts, label }: Props) {
  const [callOpen, setCallOpen] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  const hasPhone = contacts.some((c) => c.phone)
  const hasEmail = contacts.some((c) => c.email)
  const phoneContacts = contacts.filter((c) => c.phone) as (ContactOption & { phone: string })[]

  return (
    <>
      <div className="flex items-center gap-2 py-2.5 border-t border-gray-200 mb-1">
        <button
          onClick={() => setCallOpen(true)}
          disabled={!hasPhone}
          className={`flex items-center gap-1.5 text-xs font-medium bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg transition-colors border border-green-100 active:scale-95 ${!hasPhone ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          <Phone className="w-3.5 h-3.5" />
          Call
        </button>
        <button
          onClick={() => setSmsOpen(true)}
          disabled={!hasPhone}
          className={`flex items-center gap-1.5 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors border border-blue-100 active:scale-95 ${!hasPhone ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          SMS
        </button>
        <button
          onClick={() => setEmailOpen(true)}
          disabled={!hasEmail}
          className={`flex items-center gap-1.5 text-xs font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg transition-colors border border-purple-100 active:scale-95 ${!hasEmail ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </button>
      </div>

      {callOpen && (
        <EntityCallPanel
          entityType={entityType}
          entityId={entityId}
          contacts={phoneContacts}
          label={label}
          onClose={() => setCallOpen(false)}
        />
      )}
      {smsOpen && (
        <EntitySendSmsModal
          entityType={entityType}
          entityId={entityId}
          contacts={phoneContacts}
          label={label}
          onClose={() => setSmsOpen(false)}
        />
      )}
      {emailOpen && (
        <EntityComposeEmailModal
          entityType={entityType}
          entityId={entityId}
          contacts={contacts}
          label={label}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </>
  )
}
