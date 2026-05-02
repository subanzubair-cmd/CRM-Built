'use client'

import { Phone, Mail } from 'lucide-react'
import { EntityQuickActionBar } from '@/components/comm/EntityQuickActionBar'

interface PhoneEntry { label: string; number: string }
interface EmailEntry { label: string; email: string }

interface Props {
  buyerId: string
  buyerName?: string
  phones: PhoneEntry[]
  emails: EmailEntry[]
}

export function BuyerContactSection({ buyerId, buyerName = 'Buyer', phones, emails }: Props) {
  // Build ContactOption objects from phone/email arrays for the QuickActionBar
  const allContacts = [
    ...phones.map((p) => ({ id: p.number, name: buyerName, phone: p.number, type: p.label || 'Mobile' })),
    ...emails.map((e) => ({ id: e.email, name: buyerName, email: e.email, type: e.label || 'Email' })),
  ]

  return (
    <div>
      {/* Quick Action Bar — same as Leads (Call/SMS/Email pills) */}
      <EntityQuickActionBar
        entityType="buyer"
        entityId={buyerId}
        contacts={allContacts}
        label={buyerName}
      />

      {/* Contact list display */}
      <div className="mt-2 space-y-1">
        {phones.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-[10px] uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">{p.label || 'Phone'}</span>
            <span className="text-gray-900 font-mono text-[13px]">{p.number}</span>
          </div>
        ))}
        {emails.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-sm mt-1">
            <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-[10px] uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">{e.label || 'Email'}</span>
            <span className="text-gray-900 text-[13px]">{e.email}</span>
          </div>
        ))}
        {phones.length === 0 && emails.length === 0 && (
          <p className="text-sm text-gray-300">—</p>
        )}
      </div>
    </div>
  )
}
