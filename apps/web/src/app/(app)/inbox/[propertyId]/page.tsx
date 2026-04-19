import { redirect } from 'next/navigation'

type Params = { params: Promise<{ propertyId: string }> }

export default async function InboxPropertyPage({ params }: Params) {
  const { propertyId } = await params
  redirect(`/inbox?propertyId=${propertyId}`)
}
