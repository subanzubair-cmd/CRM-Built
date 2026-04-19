import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getEmailConversations } from '@/lib/email'
import { EmailInbox } from '@/components/email/EmailInbox'
import { EmailHeader } from '@/components/email/EmailHeader'

interface PageProps {
  searchParams: Promise<{ page?: string }>
}

export const metadata = { title: 'Email' }

export default async function EmailPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const { rows, total } = await getEmailConversations({
    page: sp.page ? parseInt(sp.page) : 1,
  })

  return (
    <div>
      <EmailHeader />
      <EmailInbox rows={rows as any} total={total} />
    </div>
  )
}
