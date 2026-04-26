import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  TwilioNumber,
  Message,
  ActiveCall,
  Property,
  Contact,
  LeadCampaign,
  Op,
} from '@crm/database'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/phone-numbers/[id]/activity
 *
 * Returns the last 50 messages and last 50 calls touching this number
 * (either side). Powers the per-number detail page.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const numberRow = await TwilioNumber.findByPk(id, { raw: true }) as any
  if (!numberRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const e164 = numberRow.number as string

  // Recent messages where this number is either sender or recipient.
  const messages = await Message.findAll({
    where: {
      [Op.or]: [{ from: e164 }, { to: e164 }],
    },
    include: [
      { model: Property, as: 'property', attributes: ['id', 'streetAddress', 'city', 'state'] },
      { model: Contact, as: 'contact', attributes: ['id', 'firstName', 'lastName', 'phone'] },
    ],
    order: [['createdAt', 'DESC']],
    limit: 50,
  })

  // Recent calls scoped to this number via the campaign linkage.
  const linkedCampaign = await LeadCampaign.findOne({
    where: { phoneNumberId: id },
    attributes: ['id', 'name', 'type'],
    raw: true,
  }) as any

  const calls = linkedCampaign
    ? await ActiveCall.findAll({
        where: { leadCampaignId: linkedCampaign.id },
        include: [
          { model: Property, as: 'property', attributes: ['id', 'streetAddress', 'city', 'state'] },
        ],
        order: [['startedAt', 'DESC']],
        limit: 50,
      })
    : []

  return NextResponse.json({
    number: {
      id: numberRow.id,
      number: numberRow.number,
      friendlyName: numberRow.friendlyName,
      providerName: numberRow.providerName,
      providerSid: numberRow.providerSid,
      lastSyncedAt: numberRow.lastSyncedAt,
      isActive: numberRow.isActive,
      spamStatus: numberRow.spamStatus,
      tenDlcStatus: numberRow.tenDlcStatus,
      purpose: numberRow.purpose,
      marketId: numberRow.marketId,
      speedToLead: numberRow.speedToLead,
      createdAt: numberRow.createdAt,
    },
    campaign: linkedCampaign,
    messages: messages.map((m) => m.get({ plain: true })),
    calls: calls.map((c) => c.get({ plain: true })),
  })
}
