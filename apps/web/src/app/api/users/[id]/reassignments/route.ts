import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/users/[id]/reassignments
 *
 * Returns campaigns/properties grouped by (lead type → market → campaign) where
 * the user being deleted has assignments. For each campaign, includes the list
 * of OTHER users currently assigned to properties in that campaign — those are
 * the eligible reassignment candidates.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'users.manage')
  if (deny) return deny

  const { id: userId } = await params

  // Leads (Properties assigned to this user)
  const properties = await prisma.property.findMany({
    where: { assignedToId: userId },
    select: {
      id: true,
      campaignName: true,
      leadType: true,
      market: { select: { id: true, name: true } },
    },
  })

  // Group by market + campaign
  type CampaignBucket = {
    campaignKey: string
    campaignName: string
    propertyIds: string[]
    marketId: string | null
    marketName: string
    leadType: string
  }
  const buckets = new Map<string, CampaignBucket>()
  for (const p of properties) {
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

  // For each bucket, find OTHER users currently assigned to properties under the
  // same campaign (across all their properties — not just this user's)
  const enrichedBuckets = await Promise.all(
    [...buckets.values()].map(async (bucket) => {
      const otherAssignees = await prisma.property.findMany({
        where: {
          campaignName: bucket.campaignName,
          ...(bucket.marketId ? { marketId: bucket.marketId } : {}),
          assignedToId: { not: null, notIn: [userId] },
        },
        select: { assignedTo: { select: { id: true, name: true, email: true } } },
        distinct: ['assignedToId'],
      })
      const eligibleUsers = otherAssignees
        .map((o) => o.assignedTo)
        .filter((u): u is { id: string; name: string; email: string } => Boolean(u))

      return {
        campaignKey: bucket.campaignKey,
        campaignName: bucket.campaignName,
        marketId: bucket.marketId,
        marketName: bucket.marketName,
        leadCount: bucket.propertyIds.length,
        eligibleUsers,
        isOnlyAssignee: eligibleUsers.length === 0,
      }
    })
  )

  // Buyers — users assigned via dispoAssigneeId
  const buyersProperties = await prisma.property.findMany({
    where: { dispoAssigneeId: userId },
    select: {
      id: true,
      campaignName: true,
      market: { select: { id: true, name: true } },
    },
  })

  const buyerBuckets = new Map<string, CampaignBucket>()
  for (const p of buyersProperties) {
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
      const otherAssignees = await prisma.property.findMany({
        where: {
          campaignName: bucket.campaignName,
          ...(bucket.marketId ? { marketId: bucket.marketId } : {}),
          dispoAssigneeId: { not: null, notIn: [userId] },
        },
        select: { dispoAssignee: { select: { id: true, name: true, email: true } } },
        distinct: ['dispoAssigneeId'],
      })
      const eligibleUsers = otherAssignees
        .map((o) => o.dispoAssignee)
        .filter((u): u is { id: string; name: string; email: string } => Boolean(u))

      return {
        campaignKey: bucket.campaignKey,
        campaignName: bucket.campaignName,
        marketId: bucket.marketId,
        marketName: bucket.marketName,
        leadCount: bucket.propertyIds.length,
        eligibleUsers,
        isOnlyAssignee: eligibleUsers.length === 0,
      }
    })
  )

  return NextResponse.json({
    leadsReassignment: enrichedBuckets,
    buyersReassignment: enrichedBuyerBuckets,
  })
}
