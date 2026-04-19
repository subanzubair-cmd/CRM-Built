'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MessageSquare, Loader2 } from 'lucide-react'
import { ConversationList } from '@/components/inbox/ConversationList'
import { MessageThread } from '@/components/inbox/MessageThread'
import { LogCommunicationForm } from '@/components/inbox/LogCommunicationForm'
import { ConversationContext } from '@/components/inbox/ConversationContext'
import type { ConversationRow, ConversationMessage, ConversationContext as ContextType } from '@/lib/inbox'

interface Props {
  conversations: ConversationRow[]
  initialPropertyId?: string | null
}

export function InboxLayout({ conversations, initialPropertyId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentPropertyId = searchParams.get('conversationId') ?? initialPropertyId ?? null

  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [context, setContext] = useState<ContextType | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)

  const fetchMessages = useCallback(async (propertyId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/inbox/${propertyId}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages ?? [])
      }
    } catch {
      // silently fail
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const fetchContext = useCallback(async (propertyId: string) => {
    setLoadingContext(true)
    try {
      const res = await fetch(`/api/inbox/${propertyId}/context`)
      if (res.ok) {
        const data = await res.json()
        setContext(data.context ?? null)
      }
    } catch {
      // silently fail
    } finally {
      setLoadingContext(false)
    }
  }, [])

  // Load messages + context when conversation changes
  useEffect(() => {
    if (currentPropertyId) {
      fetchMessages(currentPropertyId)
      fetchContext(currentPropertyId)
    } else {
      setMessages([])
      setContext(null)
    }
  }, [currentPropertyId, fetchMessages, fetchContext])

  function handleSelect(propertyId: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('conversationId', propertyId)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function handleMessageSent() {
    if (currentPropertyId) {
      fetchMessages(currentPropertyId)
    }
  }

  // Get the selected conversation's property address for the header
  const selectedConv = conversations.find(
    (c) => (c.property?.id ?? c.id) === currentPropertyId,
  )
  const headerTitle = selectedConv?.property?.streetAddress ?? 'Unknown Property'
  const headerSubtitle = selectedConv?.property?.city
    ? `${selectedConv.property.city}${selectedConv.property.state ? `, ${selectedConv.property.state}` : ''}`
    : null

  return (
    <div
      className="flex -m-5 overflow-hidden"
      style={{ height: 'calc(100vh - 52px)' }}
    >
      {/* Left Panel: Conversation List (280px) */}
      <div className="w-[280px] flex-shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-hidden">
        <ConversationList
          rows={conversations}
          selectedPropertyId={currentPropertyId}
          onSelect={handleSelect}
        />
      </div>

      {/* Center Panel: Message Thread (flex-1) */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
        {currentPropertyId ? (
          <>
            {/* Thread Header */}
            <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{headerTitle}</p>
              {headerSubtitle && (
                <p className="text-xs text-gray-400">{headerSubtitle}</p>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
                </div>
              ) : (
                <MessageThread messages={messages as any} />
              )}
            </div>

            {/* Compose */}
            <div className="border-t border-gray-200 bg-white p-4 flex-shrink-0">
              <LogCommunicationForm
                propertyId={currentPropertyId}
                onSent={handleMessageSent}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <MessageSquare className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-500">Select a conversation</p>
            <p className="text-xs text-gray-400 mt-1">
              Choose a conversation from the left to view messages
            </p>
          </div>
        )}
      </div>

      {/* Right Panel: Context (300px) */}
      <div className="w-[300px] flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
        <ConversationContext context={context} loading={loadingContext} />
      </div>
    </div>
  )
}
