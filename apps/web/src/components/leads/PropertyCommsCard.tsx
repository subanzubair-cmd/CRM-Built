import { getConversationMessages } from '@/lib/inbox'
import { MessageThread } from '@/components/inbox/MessageThread'
import { LogCommunicationForm } from '@/components/inbox/LogCommunicationForm'

interface Props {
  propertyId: string
}

export async function PropertyCommsCard({ propertyId }: Props) {
  const messages = await getConversationMessages(propertyId)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Communications</h3>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          <MessageThread messages={messages as any} />
        </div>
      </div>
      <LogCommunicationForm propertyId={propertyId} />
    </div>
  )
}
