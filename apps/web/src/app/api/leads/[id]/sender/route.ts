import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Property, LeadCampaign, TwilioNumber } from '@crm/database'

/**
 * GET /api/leads/[id]/sender
 *
 * Lightweight endpoint that returns just the two pieces of data the
 * CallPanel + SendSmsModal need to pre-select the "Sending From"
 * number:
 *
 *   { defaultOutboundNumber, campaignNumber }
 *
 * The full /api/leads/[id] GET pulls a wide column set (price fields,
 * dates, exit strategy, etc.) plus a campaign join — overkill when
 * the modal only wants two phone strings, and noticeably slow on
 * large property tables. This endpoint queries one row with two
 * attributes + a single nested attribute, which keeps the modal's
 * "default number is loading…" gap effectively invisible.
 */
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const property = (await Property.findByPk(id, {
    attributes: ['id', 'defaultOutboundNumber'],
    include: [
      {
        model: LeadCampaign,
        as: 'leadCampaign',
        attributes: ['id'],
        include: [{ model: TwilioNumber, as: 'phoneNumber', attributes: ['number'] }],
      },
    ],
  })) as any
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const json = property.get({ plain: true })
  return NextResponse.json({
    defaultOutboundNumber: json.defaultOutboundNumber ?? null,
    campaignNumber: json.leadCampaign?.phoneNumber?.number ?? null,
  })
}
