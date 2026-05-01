'use client'

import { useState } from 'react'
import { Phone, Mail } from 'lucide-react'
import { PhoneActions, EmailActions } from '@/components/ui/ContactActionButtons'
import { SendSmsModal } from '@/components/ui/SendSmsModal'
import { LogCallModal } from '@/components/ui/LogCallModal'
import { LogEmailModal } from '@/components/ui/LogEmailModal'

interface PhoneEntry { label: string; number: string }
interface EmailEntry { label: string; email: string }

interface Props {
  buyerId: string
  phones: PhoneEntry[]
  emails: EmailEntry[]
}

export function BuyerContactSection({ buyerId, phones, emails }: Props) {
  const [smsTarget, setSmsTarget] = useState<string | null>(null)
  const [callTarget, setCallTarget] = useState<string | null>(null)
  const [emailTarget, setEmailTarget] = useState<string | null>(null)

  return (
    <>
      {/* Phones */}
      {phones.length === 0 ? (
        <p className="text-sm text-gray-300">—</p>
      ) : (
        <ul className="space-y-2">
          {phones.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-[10px] uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">{p.label || 'Phone'}</span>
              <span className="text-gray-900 font-mono text-[13px]">{p.number}</span>
              <PhoneActions
                number={p.number}
                onCall={() => setCallTarget(p.number)}
                onSms={() => setSmsTarget(p.number)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Emails */}
      {emails.length === 0 ? (
        <p className="text-sm text-gray-300">—</p>
      ) : (
        <ul className="space-y-2 mt-2">
          {emails.map((e, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-[10px] uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">{e.label || 'Email'}</span>
              <span className="text-gray-900 text-[13px]">{e.email}</span>
              <EmailActions
                email={e.email}
                onEmail={() => setEmailTarget(e.email)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Modals */}
      <SendSmsModal open={!!smsTarget} onClose={() => setSmsTarget(null)} toPhone={smsTarget ?? ''} entityType="buyer" entityId={buyerId} />
      <LogCallModal open={!!callTarget} onClose={() => setCallTarget(null)} toPhone={callTarget ?? ''} entityType="buyer" entityId={buyerId} />
      <LogEmailModal open={!!emailTarget} onClose={() => setEmailTarget(null)} toEmail={emailTarget ?? ''} entityType="buyer" entityId={buyerId} />
    </>
  )
}
