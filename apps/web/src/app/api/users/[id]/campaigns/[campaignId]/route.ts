import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { UserCampaignAssignment } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string; campaignId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny
  const { id: userId, campaignId } = await params

  await UserCampaignAssignment.destroy({
    where: { userId, campaignId },
  })

  return NextResponse.json({ success: true })
}
