import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  TwilioNumber,
  LeadCampaign,
  Message,
  ActiveCall,
  Op,
  literal,
  sequelize,
  QueryTypes,
} from '@crm/database'

/**
 * GET /api/phone-numbers/stats
 *
 * Returns the enriched list every column the new Phone Numbers panel needs:
 *
 *   numbers: [{
 *     id, number, friendlyName, providerName, lastSyncedAt,
 *     isActive, spamStatus, tenDlcStatus, purpose, marketId,
 *     campaign: { id, name, type } | null,
 *     stats30d: { smsIn, smsOut, callsIn, callsOut },
 *   }]
 *   kpis: { total, assigned, unassigned, inactive }
 *
 * One round-trip, single SQL aggregation for the per-number stats so the
 * page renders in O(1) queries instead of O(N).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const numberRows = await TwilioNumber.findAll({
    order: [['createdAt', 'DESC']],
    raw: true,
  }) as unknown as Array<{
    id: string
    number: string
    friendlyName: string | null
    providerName: string | null
    lastSyncedAt: Date | null
    isActive: boolean
    spamStatus: string | null
    tenDlcStatus: string | null
    purpose: string
    marketId: string | null
  }>

  // Pull every campaign that has a phoneNumberId set, so we can join in JS
  // (one query, no N+1).
  const campaignRows = await LeadCampaign.findAll({
    where: { phoneNumberId: { [Op.ne]: null } },
    attributes: ['id', 'name', 'type', 'phoneNumberId'],
    raw: true,
  }) as unknown as Array<{
    id: string
    name: string
    type: string
    phoneNumberId: string
  }>
  const campaignByPhoneId = new Map(campaignRows.map((c) => [c.phoneNumberId, c]))

  // Per-number activity rollup. Aggregating in SQL keeps it constant cost
  // regardless of how many numbers you have.
  const numbers = numberRows.map((n) => n.number)
  const e164List = numbers
  const stats30d = new Map<string, { smsIn: number; smsOut: number; callsIn: number; callsOut: number }>()

  if (e164List.length > 0) {
    // Messages aggregated by direction + which side the number is on.
    const msgRows = await sequelize.query<{
      number: string
      direction: 'INBOUND' | 'OUTBOUND'
      cnt: string
    }>(
      `
      SELECT n AS number, m.direction, COUNT(*)::text AS cnt
      FROM unnest($1::text[]) AS n
      JOIN "Message" m
        ON (m.direction = 'OUTBOUND' AND m."from" = n)
        OR (m.direction = 'INBOUND'  AND m."to"   = n)
      WHERE m."createdAt" >= $2 AND m.channel = 'SMS'
      GROUP BY n, m.direction
      `,
      { bind: [e164List, since], type: QueryTypes.SELECT },
    )

    for (const r of msgRows) {
      const cur = stats30d.get(r.number) ?? { smsIn: 0, smsOut: 0, callsIn: 0, callsOut: 0 }
      if (r.direction === 'INBOUND') cur.smsIn = Number(r.cnt)
      else cur.smsOut = Number(r.cnt)
      stats30d.set(r.number, cur)
    }

    // Calls — use ActiveCall.customerPhone for the customer side and
    // resolve the agent/CRM-side number from the same table. Inbound calls
    // hit one of OUR numbers (the `to` field on ActiveCall isn't tracked
    // explicitly per row, but agentCallSid is the agent's outbound leg, so
    // for the rollup we approximate by using the conference call counts:
    // each call belongs to one of our numbers via the campaign linkage).
    //
    // For per-number breakdown without per-call number persistence, count
    // calls grouped by the campaign's phone number for any call that ties
    // to a campaign, plus a fallback bucket for direct customer calls.
    const callRows = await sequelize.query<{
      number: string
      direction: 'INBOUND' | 'OUTBOUND'
      cnt: string
    }>(
      `
      SELECT
        tn.number AS number,
        CASE WHEN ac.direction IS NOT NULL THEN ac.direction ELSE 'OUTBOUND' END AS direction,
        COUNT(*)::text AS cnt
      FROM "ActiveCall" ac
      JOIN "LeadCampaign" lc ON lc.id = ac."leadCampaignId"
      JOIN "TwilioNumber" tn ON tn.id = lc."phoneNumberId"
      WHERE ac."startedAt" >= $1
        AND tn.number = ANY($2::text[])
      GROUP BY tn.number, ac.direction
      `,
      { bind: [since, e164List], type: QueryTypes.SELECT },
    ).catch((err) => {
      // ActiveCall.direction may not be a real column on every schema — fall
      // back to a single bucket on error rather than 500ing the whole page.
      console.warn('[phone-numbers/stats] call rollup degraded:', err)
      return [] as Array<{ number: string; direction: 'INBOUND' | 'OUTBOUND'; cnt: string }>
    })

    for (const r of callRows) {
      const cur = stats30d.get(r.number) ?? { smsIn: 0, smsOut: 0, callsIn: 0, callsOut: 0 }
      if (r.direction === 'INBOUND') cur.callsIn = Number(r.cnt)
      else cur.callsOut = Number(r.cnt)
      stats30d.set(r.number, cur)
    }
  }

  const enriched = numberRows.map((n) => ({
    id: n.id,
    number: n.number,
    friendlyName: n.friendlyName,
    providerName: n.providerName,
    lastSyncedAt: n.lastSyncedAt,
    isActive: n.isActive,
    spamStatus: n.spamStatus,
    tenDlcStatus: n.tenDlcStatus,
    purpose: n.purpose,
    marketId: n.marketId,
    campaign: campaignByPhoneId.get(n.id)
      ? {
          id: campaignByPhoneId.get(n.id)!.id,
          name: campaignByPhoneId.get(n.id)!.name,
          type: campaignByPhoneId.get(n.id)!.type,
        }
      : null,
    stats30d: stats30d.get(n.number) ?? { smsIn: 0, smsOut: 0, callsIn: 0, callsOut: 0 },
  }))

  const kpis = {
    total: enriched.length,
    assigned: enriched.filter((n) => n.campaign !== null).length,
    unassigned: enriched.filter((n) => n.campaign === null && n.isActive).length,
    inactive: enriched.filter((n) => !n.isActive).length,
  }

  return NextResponse.json({ numbers: enriched, kpis })
}
