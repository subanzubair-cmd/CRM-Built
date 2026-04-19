'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Mail, MessageSquare, Pencil, Trash2, Plus } from 'lucide-react'
import { AddContactModal } from './AddContactModal'
import { EditContactModal } from './EditContactModal'
import { CallPanel } from './CallPanel'
import { SendSmsModal } from './SendSmsModal'
import { ComposeEmailModal } from './ComposeEmailModal'
import { CallDispositionModal } from './CallDispositionModal'

interface PropertyContact {
  id: string
  isPrimary: boolean
  role: string | null
  contact: {
    id: string
    firstName: string
    lastName: string | null
    phone: string | null
    phone2: string | null
    email: string | null
    type: string
    doNotCall?: boolean
    doNotText?: boolean
    preferredChannel?: string | null
  }
}

interface Props {
  propertyId: string
  propertyAddress: string
  contacts: PropertyContact[]
}

export function ContactsCard({ propertyId, propertyAddress, contacts }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingContact, setEditingContact] = useState<PropertyContact | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Modal state — per-contact default selection
  const [callDefaultContactId, setCallDefaultContactId] = useState<string | null>(null)
  const [smsDefaultContactId, setSmsDefaultContactId] = useState<string | null>(null)
  const [emailDefaultContactId, setEmailDefaultContactId] = useState<string | null>(null)

  // Call outcome state
  const [callOutcomeData, setCallOutcomeData] = useState<{
    callId: string | null
    callStartedAt: Date
    contactName: string
    contactPhone: string
    propertyAddress: string
    selectedContact: { id: string; name: string; phone: string; email?: string | null; type?: string }
  } | null>(null)

  // Build contact options for the new modals
  const contactOptions = contacts.map((pc) => ({
    id: pc.contact.id,
    name: `${pc.contact.firstName} ${pc.contact.lastName ?? ''}`.trim(),
    phone: pc.contact.phone ?? '',
    email: pc.contact.email ?? null,
    type: pc.contact.type,
  })).filter((c) => c.phone || c.email)

  async function handleRemove(pc: PropertyContact) {
    if (!confirm(`Remove ${pc.contact.firstName} ${pc.contact.lastName ?? ''}?`)) return
    setRemovingId(pc.contact.id)
    try {
      await fetch(`/api/properties/${propertyId}/contacts/${pc.contact.id}`, {
        method: 'DELETE',
      })
      router.refresh()
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Contacts <span className="text-gray-400 font-normal">({contacts.length})</span>
          </h3>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400">No contacts</p>
        ) : (
          <div className="space-y-3">
            {contacts.map((pc) => {
              const name = `${pc.contact.firstName} ${pc.contact.lastName ?? ''}`.trim()
              return (
                <div key={pc.id} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-blue-700">
                      {pc.contact.firstName[0]}{pc.contact.lastName?.[0] ?? ''}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900">{name}</p>
                      {pc.isPrimary && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">Primary</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">{pc.role ?? pc.contact.type}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {pc.contact.phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <Phone className="w-3 h-3" />
                          {pc.contact.phone}
                          {pc.contact.doNotCall && (
                            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 leading-none">DNC</span>
                          )}
                          {pc.contact.doNotText && (
                            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 leading-none">DNT</span>
                          )}
                        </span>
                      )}
                      {pc.contact.email && (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <Mail className="w-3 h-3" />
                          {pc.contact.email}
                        </span>
                      )}
                    </div>
                    {/* Action buttons row */}
                    <div className="flex items-center gap-1 mt-2">
                      {pc.contact.phone && (
                        <button
                          onClick={() => !pc.contact.doNotCall && setCallDefaultContactId(pc.contact.id)}
                          disabled={!!pc.contact.doNotCall}
                          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-green-50 text-green-700 border border-green-100 rounded-md transition-colors active:scale-95 ${pc.contact.doNotCall ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-100'}`}
                          title={pc.contact.doNotCall ? 'Do Not Call' : `Call ${pc.contact.phone}`}
                        >
                          <Phone className="w-3 h-3" />
                          Call
                        </button>
                      )}
                      {pc.contact.phone && (
                        <button
                          onClick={() => !pc.contact.doNotText && setSmsDefaultContactId(pc.contact.id)}
                          disabled={!!pc.contact.doNotText}
                          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100 rounded-md transition-colors active:scale-95 ${pc.contact.doNotText ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-100'}`}
                          title={pc.contact.doNotText ? 'Do Not Text' : `SMS ${pc.contact.phone}`}
                        >
                          <MessageSquare className="w-3 h-3" />
                          SMS
                        </button>
                      )}
                      {pc.contact.email && (
                        <button
                          onClick={() => setEmailDefaultContactId(pc.contact.id)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-100 rounded-md hover:bg-purple-100 transition-colors active:scale-95"
                          title={`Email ${pc.contact.email}`}
                        >
                          <Mail className="w-3 h-3" />
                          Email
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingContact(pc)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Edit contact"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemove(pc)}
                      disabled={removingId === pc.contact.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-colors"
                      title="Remove contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <AddContactModal
          propertyId={propertyId}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); router.refresh() }}
        />
      )}

      {editingContact && (
        <EditContactModal
          propertyId={propertyId}
          contact={{
            contactId: editingContact.contact.id,
            firstName: editingContact.contact.firstName,
            lastName: editingContact.contact.lastName,
            phone: editingContact.contact.phone,
            email: editingContact.contact.email,
            contactType: editingContact.contact.type,
            role: editingContact.role,
            isPrimary: editingContact.isPrimary,
            doNotCall: editingContact.contact.doNotCall ?? false,
            doNotText: editingContact.contact.doNotText ?? false,
            preferredChannel: editingContact.contact.preferredChannel ?? null,
          }}
          onClose={() => setEditingContact(null)}
          onSaved={() => { setEditingContact(null); router.refresh() }}
        />
      )}

      {callDefaultContactId && (
        <CallPanel
          propertyId={propertyId}
          contacts={contactOptions}
          defaultContactId={callDefaultContactId}
          propertyAddress={propertyAddress}
          pipeline="leads"
          prevLeadId={null}
          nextLeadId={null}
          onClose={() => setCallDefaultContactId(null)}
          onNavigateLead={() => {}}
          onEndCall={(data) => {
            setCallDefaultContactId(null)
            setCallOutcomeData(data)
          }}
        />
      )}

      {smsDefaultContactId && (
        <SendSmsModal
          propertyId={propertyId}
          contacts={contactOptions}
          defaultContactId={smsDefaultContactId}
          propertyAddress={propertyAddress}
          onClose={() => setSmsDefaultContactId(null)}
        />
      )}

      {emailDefaultContactId && (
        <ComposeEmailModal
          propertyId={propertyId}
          contacts={contactOptions}
          defaultContactId={emailDefaultContactId}
          propertyAddress={propertyAddress}
          onClose={() => setEmailDefaultContactId(null)}
        />
      )}

      {callOutcomeData && (
        <CallDispositionModal
          propertyId={propertyId}
          propertyAddress={propertyAddress}
          contacts={contactOptions}
          selectedContact={callOutcomeData.selectedContact}
          callId={callOutcomeData.callId}
          callStartedAt={callOutcomeData.callStartedAt}
          pipeline="leads"
          nextLeadId={null}
          onClose={() => { setCallOutcomeData(null); router.refresh() }}
          onCallNext={() => {}}
          onRedial={() => { setCallOutcomeData(null); setCallDefaultContactId(callOutcomeData.selectedContact.id) }}
        />
      )}
    </>
  )
}
