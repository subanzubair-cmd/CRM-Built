import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getConversationList } from '@/lib/inbox'
import { getMarketScope } from '@/lib/auth-utils'
import { InboxLayout } from '@/components/inbox/InboxLayout'

type PageProps = {
  searchParams: Promise<{ conversationId?: string }>
}

export const metadata = { title: 'Inbox' }

export default async function InboxPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { conversationId } = await searchParams
  const marketIds = getMarketScope(session)

  const { rows } = await getConversationList({ pageSize: 100, marketIds })

  return (
    <InboxLayout
      conversations={rows}
      initialPropertyId={conversationId ?? null}
    />
  )
}
