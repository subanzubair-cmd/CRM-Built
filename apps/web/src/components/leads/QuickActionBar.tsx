'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Phone, MessageSquare, Mail } from 'lucide-react'
import { CallPanel } from './CallPanel'
import { CallDispositionModal } from './CallDispositionModal'
import { SendSmsModal } from './SendSmsModal'
import { ComposeEmailModal } from './ComposeEmailModal'

export interface ContactOption {
  id: string
  name: string
  phone: string
  email?: string | null
  type?: string
}

interface Props {
  propertyId: string
  contacts: ContactOption[]
  propertyAddress: string
  pipeline: string
  prevLeadId: string | null
  nextLeadId: string | null
  defaultContactId?: string
}

export function QuickActionBar({ propertyId, contacts, propertyAddress, pipeline, prevLeadId, nextLeadId, defaultContactId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [callOpen, setCallOpen] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [autoCall, setAutoCall] = useState(false)
  const [outcomeData, setOutcomeData] = useState<{
    callId: string | null
    callStartedAt: Date
    contactName: string
    contactPhone: string
    propertyAddress: string
    selectedContact: ContactOption
  } | null>(null)

  const hasPhone = contacts.some((c) => c.phone)
  const hasEmail = contacts.some((c) => c.email)

  // Auto-open call panel when navigated with ?action=call (from Kanban call button)
  useEffect(() => {
    if (searchParams.get('action') === 'call' && hasPhone && !callOpen) {
      setCallOpen(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCallNext(nextId: string) {
    setOutcomeData(null)
    setAutoCall(true)
    const basePath = pipeline === 'dts' || pipeline === 'dta' ? `/leads/${pipeline}` : `/${pipeline}`
    router.push(`${basePath}/${nextId}?action=call`)
  }

  function handleRedial() {
    setOutcomeData(null)
    setAutoCall(true)
    setCallOpen(true)
  }

  function handleNavigateLead(direction: 'prev' | 'next') {
    const targetId = direction === 'prev' ? prevLeadId : nextLeadId
    if (!targetId) return
    // Determine the base path from the pipeline
    const basePath = pipeline === 'dts' || pipeline === 'dta' ? `/leads/${pipeline}` : `/${pipeline}`
    router.push(`${basePath}/${targetId}`)
  }

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

      {/* Call Panel (sidebar) */}
      {callOpen && (
        <CallPanel
          propertyId={propertyId}
          contacts={contacts.filter((c) => c.phone)}
          propertyAddress={propertyAddress}
          pipeline={pipeline}
          prevLeadId={prevLeadId}
          nextLeadId={nextLeadId}
          autoCall={autoCall}
          onClose={() => setCallOpen(false)}
          onNavigateLead={handleNavigateLead}
          onAutoCallDone={() => setAutoCall(false)}
          onEndCall={(data) => {
            setCallOpen(false)
            setAutoCall(false)
            setOutcomeData(data)
          }}
        />
      )}

      {/* Call Disposition Modal */}
      {outcomeData && (
        <CallDispositionModal
          propertyId={propertyId}
          propertyAddress={propertyAddress}
          contacts={contacts}
          selectedContact={outcomeData.selectedContact}
          callId={outcomeData.callId}
          callStartedAt={outcomeData.callStartedAt}
          pipeline={pipeline}
          nextLeadId={nextLeadId}
          onClose={() => { setOutcomeData(null); router.refresh() }}
          onCallNext={handleCallNext}
          onRedial={handleRedial}
        />
      )}

      {/* SMS Modal */}
      {smsOpen && (
        <SendSmsModal
          propertyId={propertyId}
          contacts={contacts.filter((c) => c.phone)}
          defaultContactId={defaultContactId}
          propertyAddress={propertyAddress}
          onClose={() => setSmsOpen(false)}
        />
      )}

      {/* Email Modal */}
      {emailOpen && (
        <ComposeEmailModal
          propertyId={propertyId}
          contacts={contacts}
          defaultContactId={defaultContactId}
          propertyAddress={propertyAddress}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </>
  )
}
