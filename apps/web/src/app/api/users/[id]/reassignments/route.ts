import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Property, Market, User, Op } from '@crm/database'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny

  const { id: userId } = await params

  const properties = await Property.findAll({
    where: { assignedToId: userId },
    attributes: ['id', 'campaignName', 'leadType', 'marketId'],
    include: [{ model: Market, as: 'market', attributes: ['id', 'name'] }],
  })

  type CampaignBucket = {
    campaignKey: string
    campaignName: string
    propertyIds: string[]
    marketId: string | null
    marketName: string
    leadType: string
  }
  const buckets = new Map<string, CampaignBucket>()
  for (const row of properties) {
    const p = row.get({ plain: true }) as any
    const marketId = p.market?.id ?? 'none'
    const marketName = p.market?.name ?? 'Primary Market'
    const campaignName = p.campaignName ?? 'Uncategorized'
    const key = `${marketId}::${campaignName}`
    const existing = buckets.get(key)
    if (existing) {
      existing.propertyIds.push(p.id)
    } else {
      buckets.set(key, {
        campaignKey: key,
        campaignName,
        propertyIds: [p.id],
        marketId: p.market?.id ?? null,
        marketName,
        leadType: p.leadType,
      })
    }
  }

  const enrichedBuckets = await Promise.all(
    [...buckets.values()].map(async (bucket) => {
      const otherAssignees = await Property.findAll({
        where: {
          campaignName: bucket.campaignName,
          ...(bucket.marketId ? { marketId: bucket.marketId } : {}),
          assignedToId: { [Op.ne]: null, [Op.notIn]: [userId] },
        },
        attributes: ['assignedToId'],
        include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] }],
        group: ['assignedToId', 'assignedTo.id'],
      })
      const eligibleUsers = otherAssignees
        .map((o) => (o.get({ plain: true }) as any).assignedTo)
        .filter((u: any): u is { id: string; name: string; email: string } => Boolean(u))

      return {
        campaignKey: bucket.campaignKey,
        campaignName: bucket.campaignName,
        marketId: bucket.marketId,
        marketName: bucket.marketName,
        leadCount: bucket.propertyIds.length,
        eligibleUsers,
        isOnlyAssignee: eligibleUsers.length === 0,
      }
    }),
  )

  const buyersProperties = await Property.findAll({
    where: { dispoAssigneeId: userId },
    attributes: ['id', 'campaignName', 'marketId'],
    include: [{ model: Market, as: 'market', attributes: ['id', 'name'] }],
  })

  const buyerBuckets = new Map<string, CampaignBucket>()
  for (const row of buyersProperties) {
    const p = row.get({ plain: true }) as any
    const marketId = p.market?.id ?? 'none'
    const marketName = p.market?.name ?? 'Primary Market'
    const campaignName = p.campaignName ?? 'Uncategorized'
    const key = `${marketId}::${campaignName}`
    const existing = buyerBuckets.get(key)
    if (existing) {
      existing.propertyIds.push(p.id)
    } else {
      buyerBuckets.set(key, {
        campaignKey: key,
        campaignName,
        propertyIds: [p.id],
        marketId: p.market?.id ?? null,
        marketName,
        leadType: 'DISPO',
      })
    }
  }

  const enrichedBuyerBuckets = await Promise.all(
    [...buyerBuckets.values()].map(async (bucket) => {
      const otherAssignees = await Property.findAll({
        where: {
          campaignName: bucket.campaignName,
          ...(bucket.marketId ? { marketId: bucket.marketId } : {}),
          dispoAssigneeId: { [Op.ne]: null, [Op.notIn]: [userId] },
        },
        attributes: ['dispoAssigneeId'],
        include: [{ model: User, as: 'dispoAssignee', attributes: ['id', 'name', 'email'] }],
        group: ['dispoAssigneeId', 'dispoAssignee.id'],
      })
      const eligibleUsers = otherAssignees
        .map((o) => (o.get({ plain: true }) as any).dispoAssignee)
        .filter((u: any): u is { id: string; name: string; email: string } => Boolean(u))

      return {
        campaignKey: bucket.campaignKey,
        campaignName: bucket.campaignName,
        marketId: bucket.marketId,
        marketName: bucket.marketName,
        leadCount: bucket.propertyIds.length,
        eligibleUsers,
        isOnlyAssignee: eligibleUsers.length === 0,
      }
    }),
  )

  return NextResponse.json({
    leadsReassignment: enrichedBuckets,
    buyersReassignment: enrichedBuyerBuckets,
  })
}
