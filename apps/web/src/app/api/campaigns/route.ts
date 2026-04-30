import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'
import { Campaign, CAMPAIGN_MODULE_VALUES } from '@crm/database'
import { getCampaignList } from '@/lib/campaigns'

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['DRIP', 'BROADCAST']),
  // Single-select module the campaign targets. Drives the available
  // status options on Status Change steps and the polymorphic
  // subjectType on enrollments. Default LEADS for back-compat with
  // the old single-pipeline UI.
  module: z.enum(CAMPAIGN_MODULE_VALUES as [string, ...string[]]).default('LEADS'),
  description: z.string().optional(),
  marketId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** @deprecated retained for transition; new clients should send `module` */
  leadTypes: z.array(z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT'])).default([]),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.view')
  if (deny) return deny

  const sp = req.nextUrl.searchParams
  const result = await getCampaignList({
    type: (sp.get('type') as 'DRIP' | 'BROADCAST') ?? undefined,
    status:
      (sp.get('status') as
        | 'DRAFT'
        | 'ACTIVE'
        | 'PAUSED'
        | 'COMPLETED'
        | 'ARCHIVED') ?? undefined,
    module:
      (sp.get('module') as 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD') ?? undefined,
    search: sp.get('search') ?? undefined,
    page: sp.get('page') ? parseInt(sp.get('page')!) : 1,
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateCampaignSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { name, type, module, description, marketId, tags, leadTypes } = parsed.data

  const campaign = await Campaign.create({
    name,
    type,
    module,
    description,
    marketId,
    tags,
    leadTypes,
  } as any)

  return NextResponse.json(campaign, { status: 201 })
}
