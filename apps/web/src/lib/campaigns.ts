import {
  Campaign,
  CampaignStep,
  CampaignEnrollment,
  Property,
  Market,
  Op,
  literal,
} from '@crm/database'

export interface CampaignFilter {
  type?: 'DRIP' | 'BROADCAST'
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  /** Single-select module the campaign targets. */
  module?: 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD'
  search?: string
  page?: number
  pageSize?: number
}

export async function getCampaignList(filter: CampaignFilter = {}) {
  const { type, status, module, search, page = 1, pageSize = 25 } = filter

  const where: Record<string, unknown> = {}
  if (type) where.type = type
  if (status) where.status = status
  if (module) where.module = module
  if (search) where.name = { [Op.iLike]: `%${search}%` }

  const [rows, total] = await Promise.all([
    Campaign.findAll({
      where,
      include: [
        { model: Market, as: 'market', attributes: ['name'] },
        // Pull each campaign's steps inline (id + actionType + delay)
        // so the table can render per-action counts + total duration
        // without a second round-trip per row.
        {
          model: CampaignStep,
          as: 'steps',
          attributes: ['id', 'actionType', 'delayAmount', 'delayUnit', 'config'],
          separate: true,
          order: [['order', 'ASC']],
        },
      ],
      attributes: {
        include: [
          [
            literal(
              `(SELECT COUNT(*)::int FROM "CampaignStep" cs WHERE cs."campaignId" = "Campaign"."id")`,
            ),
            'stepCount',
          ],
          [
            // Only ACTIVE enrollments count for the table's "Active on
            // Leads" column — the spec's UI shows live count, not the
            // historical total.
            literal(
              `(SELECT COUNT(*)::int FROM "CampaignEnrollment" ce WHERE ce."campaignId" = "Campaign"."id" AND ce."isActive" = TRUE)`,
            ),
            'activeEnrollmentCount',
          ],
        ],
      },
      order: [['updatedAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    }),
    Campaign.count({ where }),
  ])

  const shaped = rows.map((r) => {
    const json = r.toJSON() as any
    const steps: Array<{
      actionType: string | null
      delayAmount: number | null
      delayUnit: string | null
      config: any
    }> = Array.isArray(json.steps) ? json.steps : []

    return {
      ...json,
      _count: {
        steps: Number(json.stepCount ?? 0),
        activeEnrollments: Number(json.activeEnrollmentCount ?? 0),
      },
      actionCounts: countByAction(steps),
      totalDurationMinutes: totalDurationMinutes(steps),
    }
  })

  return { rows: shaped, total }
}

/**
 * Count steps per action type. Reminder counts come from inside TASK
 * step configs (each TASK can carry several reminders) so the
 * "Reminders" column shows how many reminder rows fire across the
 * whole campaign — closer to what users care about than just "how
 * many TASK steps exist".
 */
function countByAction(
  steps: Array<{ actionType: string | null; config: any }>,
): Record<string, number> {
  // Only the action types our build supports get a column. RVM,
  // Direct Mail, and Outbound Voice AI are deliberately excluded
  // from the campaign authoring flow per the spec, so we don't
  // surface empty columns for them either.
  const out: Record<string, number> = {
    SMS: 0,
    EMAIL: 0,
    REMINDERS: 0,
    WEBHOOK: 0,
    TAG_CHANGE: 0,
    STATUS_CHANGE: 0,
    DRIP_ENROLL: 0,
  }
  for (const s of steps) {
    const t = s.actionType ?? ''
    if (t === 'SMS') out.SMS++
    else if (t === 'EMAIL') out.EMAIL++
    else if (t === 'WEBHOOK') out.WEBHOOK++
    else if (t === 'TAG_CHANGE') out.TAG_CHANGE++
    else if (t === 'STATUS_CHANGE') out.STATUS_CHANGE++
    else if (t === 'DRIP_ENROLL') out.DRIP_ENROLL++
    if (t === 'TASK') {
      // The "Reminders" column counts reminder rows nested inside
      // TASK steps — one TASK can fan out to several SMS/email pings.
      const reminders = Array.isArray(s.config?.reminders) ? s.config.reminders : []
      out.REMINDERS += reminders.length
    }
  }
  return out
}

const DELAY_UNIT_TO_MIN: Record<string, number> = {
  MINUTES: 1,
  HOURS: 60,
  DAYS: 1440,
  WEEKS: 10080,
  // 30-day approximation — same one the executor uses for MONTHS in
  // the rare case a campaign chains months together. The "duration"
  // shown in the table is informational, so an exact calendar walk
  // isn't worth the complexity.
  MONTHS: 43200,
}

function totalDurationMinutes(
  steps: Array<{ delayAmount: number | null; delayUnit: string | null }>,
): number {
  let total = 0
  for (const s of steps) {
    const amt = Number(s.delayAmount ?? 0)
    const factor = DELAY_UNIT_TO_MIN[s.delayUnit ?? 'MINUTES'] ?? 1
    total += amt * factor
  }
  return total
}

export async function getCampaignById(id: string) {
  // Sequelize returns the campaign + its steps via include. The enrollment →
  // property join still lives on Prisma until Phase 6, so we fetch it
  // separately and re-shape into the same payload.
  const campaign = await Campaign.findByPk(id, {
    include: [
      { model: Market, as: 'market' },
      {
        model: CampaignStep,
        as: 'steps',
        separate: true,
        order: [['order', 'ASC']],
      },
    ],
  })
  if (!campaign) return null

  const enrollments = await CampaignEnrollment.findAll({
    where: { campaignId: id, isActive: true },
    order: [['enrolledAt', 'DESC']],
    limit: 50,
  })

  const propertyIds = enrollments.map((e) => e.propertyId)
  const properties =
    propertyIds.length > 0
      ? await Property.findAll({
          where: { id: { [Op.in]: propertyIds } },
          attributes: ['id', 'streetAddress', 'city', 'propertyStatus', 'leadType'],
          raw: true,
        })
      : []
  const propertyById = new Map((properties as any[]).map((p) => [p.id, p]))

  return {
    ...(campaign.toJSON() as any),
    enrollments: enrollments.map((e) => ({
      ...(e.toJSON() as any),
      property: propertyById.get(e.propertyId) ?? null,
    })),
  }
}
