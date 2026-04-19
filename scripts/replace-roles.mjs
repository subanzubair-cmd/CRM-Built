/**
 * Replace the existing roles list with the new 22-role list provided by the user.
 *
 * Since role is decoupled from permissions (permissions live on User.permissions[]),
 * all new roles are created with empty permissions arrays — they're just labels.
 *
 * Migration strategy:
 *   1. Upsert all 22 new roles (idempotent; non-destructive on first pass)
 *   2. Find any users currently assigned to a role NOT in the new list — reassign them to "Other Role"
 *   3. Delete all old roles that are not in the new list
 *   4. Delete all UserRoleConfig + LeadCampaignRoleToggle rows that referenced deleted roles
 */
import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const NEW_ROLES = [
  'Accountant',
  'Acquisition Manager',
  'Acquisition Sales Manager',
  'Admin',
  'Bookkeeper',
  'Closing Coordinator',
  'Co-Owner',
  'Cold Caller',
  'Disposition Manager',
  'Lead Manager',
  'Marketing Assistant',
  'Marketing Manager',
  'Office Manager',
  'Other Role',
  'Owner',
  'Project Manager',
  'Property Analyst',
  'Property Manager',
  'Real Estate Agent',
  'Social Media Manager',
  'TC Assistant',
  'Transaction Coordinator',
]

async function main() {
  // Step 1 — upsert all 22 new roles (with empty permissions; permissions live on User now)
  for (const name of NEW_ROLES) {
    await prisma.role.upsert({
      where: { name },
      create: { name, description: name, permissions: [], isSystem: true },
      update: { isSystem: true }, // don't clobber description/permissions on existing
    })
  }

  // Step 2 — find users on outdated roles
  const otherRole = await prisma.role.findUnique({ where: { name: 'Other Role' } })
  if (!otherRole) throw new Error('Other Role not created')

  const orphaned = await prisma.user.findMany({
    where: { role: { name: { notIn: NEW_ROLES } } },
    include: { role: { select: { name: true } } },
  })

  if (orphaned.length > 0) {
    console.log(`Reassigning ${orphaned.length} user(s) from outdated roles to "Other Role":`)
    for (const u of orphaned) {
      console.log(`  ${u.name} (${u.email}) was "${u.role.name}" → "Other Role"`)
      await prisma.user.update({ where: { id: u.id }, data: { roleId: otherRole.id } })
    }
  }

  // Step 3 — find roles not in the new list
  const allRoles = await prisma.role.findMany()
  const toDelete = allRoles.filter((r) => !NEW_ROLES.includes(r.name))

  if (toDelete.length > 0) {
    console.log(`\nDeleting ${toDelete.length} outdated role(s):`)
    for (const r of toDelete) {
      console.log(`  - ${r.name}`)
      // Cascade delete UserRoleConfig + LeadCampaignRoleToggle + UserCampaignAssignment refs
      await prisma.userRoleConfig.deleteMany({ where: { roleId: r.id } })
      await prisma.leadCampaignRoleToggle.deleteMany({ where: { roleId: r.id } })
      await prisma.userCampaignAssignment.deleteMany({ where: { roleId: r.id } })
      await prisma.role.delete({ where: { id: r.id } })
    }
  }

  // Step 4 — final report
  const finalRoles = await prisma.role.findMany({ orderBy: { name: 'asc' } })
  console.log(`\nFinal role list (${finalRoles.length}):`)
  for (const r of finalRoles) console.log(`  ✓ ${r.name}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
