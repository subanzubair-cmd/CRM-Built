import { prisma } from '@/lib/prisma'
import { User, Role, Op } from '@crm/database'

type NotificationType = 'NEW_LEAD' | 'MESSAGE_RECEIVED' | 'TASK_DUE' | 'STAGE_CHANGE' | 'MENTION' | 'SYSTEM'

const FALLBACK_ROLE_NAMES = ['Lead Manager', 'Co-Owner', 'Owner']

export async function getUnreadNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId, isRead: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      propertyId: true,
      isRead: true,
      createdAt: true,
    },
  })
}

export type UnreadNotification = Awaited<ReturnType<typeof getUnreadNotifications>>[number]

/**
 * Resolve the final recipient(s) for a given userId, applying vacation rerouting.
 *
 * When `contextRoleId` is provided (typical when fanning out from a
 * PropertyTeamAssignment), same-role peers are scoped to that specific
 * assignment role rather than the user's primary User.roleId. This matters
 * when users hold multiple roles: a vacationing Dispo Manager on a team
 * should be replaced by another Dispo Manager, not by a peer who shares
 * their primary User.roleId.
 *
 * - If the user isn't on vacation, return [userId]
 * - If on vacation, reroute to same-role active peers (scope = contextRoleId or user.roleId)
 * - If no peers, fall back to Lead Manager / Co-Owner / Owner
 * - As a last resort return [userId] (even if vacationing — better than losing it)
 */
async function resolveRecipients(
  userId: string,
  contextRoleId?: string,
): Promise<string[]> {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'vacationMode', 'roleId'],
  })

  if (!user) return [userId]
  if (!user.vacationMode) return [user.id]

  const peerRoleId = contextRoleId ?? user.roleId
  const peers = await User.findAll({
    where: {
      roleId: peerRoleId,
      id: { [Op.ne]: user.id },
      vacationMode: false,
      status: 'ACTIVE',
    },
    attributes: ['id'],
  })

  let recipients: string[] = peers.map((p) => p.id)

  if (recipients.length === 0) {
    // Fallback: any active non-vacationing user holding one of the fallback
    // role names. Two-step query because the original Prisma version used
    // a relation filter (`role: { name: { in: ... } }`) and Sequelize doesn't
    // do those without an `include` join.
    const fallbackRoles = await Role.findAll({
      where: { name: { [Op.in]: FALLBACK_ROLE_NAMES } },
      attributes: ['id'],
    })
    if (fallbackRoles.length > 0) {
      const fallbackUsers = await User.findAll({
        where: {
          roleId: { [Op.in]: fallbackRoles.map((r) => r.id) },
          vacationMode: false,
          status: 'ACTIVE',
        },
        attributes: ['id'],
      })
      recipients = fallbackUsers.map((u) => u.id)
    }
  }

  if (recipients.length === 0) {
    recipients = [user.id]
  }

  return recipients
}

export async function createNotification(opts: {
  userId: string
  type: NotificationType
  title: string
  body: string
  propertyId?: string
}): Promise<void> {
  try {
    // Step 1: resolve primary recipients (with vacation rerouting for the original user)
    const primaryRecipients = await resolveRecipients(opts.userId)

    const recipientSet = new Set<string>(primaryRecipients)

    // Step 2: if we have a propertyId, also notify property team members
    if (opts.propertyId) {
      const teamAssignments = await (prisma as any).propertyTeamAssignment.findMany({
        where: { propertyId: opts.propertyId },
        select: { userId: true, roleId: true },
      }) as Array<{ userId: string; roleId: string }>

      for (const t of teamAssignments) {
        // Skip team member if they are the original user — already handled above
        if (t.userId === opts.userId) continue
        // Apply vacation rerouting scoped to the assignment's role (multi-role aware)
        const rerouted = await resolveRecipients(t.userId, t.roleId)
        for (const rid of rerouted) {
          recipientSet.add(rid)
        }
      }
    }

    const recipients = Array.from(recipientSet)
    if (recipients.length === 0) return

    // Step 3: bulk insert, deduplicated
    await prisma.notification.createMany({
      data: recipients.map((uid) => ({
        userId: uid,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        propertyId: opts.propertyId ?? null,
      })),
    })
  } catch (err) {
    console.error('[notifications] createNotification failed:', err)
  }
}
