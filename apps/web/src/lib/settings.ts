import { Market, User, Role, UserRoleConfig, Campaign, LeadCampaign, Op, literal } from '@crm/database'

export async function getUserList() {
  // Two queries: users with their primary role, then all UserRoleConfig
  // rows for the same users with their roles. Re-shape into the legacy
  // Prisma response so the settings table doesn't need a frontend update.
  const users = await User.findAll({
    include: [{ model: Role, as: 'role', attributes: ['id', 'name', 'permissions'] }],
    order: [
      ['status', 'ASC'],
      ['name', 'ASC'],
    ],
  })

  const userIds = users.map((u) => u.id)
  const configs =
    userIds.length > 0
      ? await UserRoleConfig.findAll({
          where: { userId: userIds as any },
          include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
        })
      : []

  const configsByUser = new Map<string, any[]>()
  for (const c of configs) {
    const json = c.toJSON() as any
    if (!configsByUser.has(json.userId)) configsByUser.set(json.userId, [])
    configsByUser.get(json.userId)!.push({
      roleId: json.roleId,
      role: json.role ? { id: json.role.id, name: json.role.name } : null,
    })
  }

  return users.map((u) => {
    const json = u.toJSON() as any
    return {
      ...json,
      roleConfigs: configsByUser.get(u.id) ?? [],
    }
  })
}

export async function getCampaignListSimple() {
  return Campaign.findAll({
    attributes: ['id', 'name', 'marketId', 'status'],
    where: { status: { [Op.in]: ['ACTIVE', 'DRAFT'] } },
    order: [['name', 'ASC']],
  })
}

/**
 * Thin LeadCampaign list used by the user-management screens to populate
 * role-assignment dropdowns. Preloaded SSR on the settings page so the
 * EditUser/AddUser panels don't need a separate client-side fetch.
 */
export async function getLeadCampaignListSimple() {
  return LeadCampaign.findAll({
    attributes: ['id', 'name', 'type'],
    where: { isActive: true },
    order: [['name', 'ASC']],
  })
}

export async function getMarketList() {
  // Markets moved to Sequelize in Phase 2. The original Prisma version
  // included `_count: { select: { properties: true } }` — emulated here
  // via a correlated-subquery attribute so the response shape is
  // unchanged for the settings UI.
  const markets = await Market.findAll({
    order: [['name', 'ASC']],
    attributes: {
      include: [
        [
          literal(
            `(SELECT COUNT(*)::int FROM "Property" p WHERE p."marketId" = "Market"."id")`,
          ),
          'propertyCount',
        ],
      ],
    },
  })
  return markets.map((m) => {
    const json = m.toJSON() as any
    return {
      ...json,
      _count: { properties: Number(json.propertyCount ?? 0) },
    }
  })
}

export async function getRoleList() {
  return Role.findAll({
    attributes: ['id', 'name', 'description', 'permissions', 'isSystem'],
    order: [['name', 'ASC']],
  })
}
