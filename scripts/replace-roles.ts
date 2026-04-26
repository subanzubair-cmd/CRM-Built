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
 *   4. Delete all UserRoleConfig + LeadCampaignRoleToggle + UserCampaignAssignment rows
 *      that referenced deleted roles
 *
 * Usage: npx tsx scripts/replace-roles.ts
 */
import 'reflect-metadata'
import {
  sequelize,
  Role,
  User,
  UserRoleConfig,
  LeadCampaignRoleToggle,
  UserCampaignAssignment,
  Op,
} from '../packages/database/src'

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
    const [row, created] = await Role.findOrCreate({
      where: { name },
      defaults: { name, description: name, permissions: [], isSystem: true } as any,
    })
    if (!created) {
      await row.update({ isSystem: true } as any)
    }
  }

  // Step 2 — find users on outdated roles
  const otherRole = await Role.findOne({ where: { name: 'Other Role' }, raw: true }) as any
  if (!otherRole) throw new Error('Other Role not created')

  const orphanedRows = await User.findAll({
    include: [{
      model: Role,
      as: 'role',
      where: { name: { [Op.notIn]: NEW_ROLES } },
      required: true,
      attributes: ['name'],
    }],
  })
  const orphaned = orphanedRows.map((u) => u.get({ plain: true }) as any)

  if (orphaned.length > 0) {
    console.log(`Reassigning ${orphaned.length} user(s) from outdated roles to "Other Role":`)
    for (const u of orphaned) {
      console.log(`  ${u.name} (${u.email}) was "${u.role.name}" → "Other Role"`)
      await User.update({ roleId: otherRole.id }, { where: { id: u.id } })
    }
  }

  // Step 3 — find roles not in the new list
  const allRolesRows = await Role.findAll({ raw: true }) as unknown as Array<{ id: string; name: string }>
  const toDelete = allRolesRows.filter((r) => !NEW_ROLES.includes(r.name))

  if (toDelete.length > 0) {
    console.log(`\nDeleting ${toDelete.length} outdated role(s):`)
    for (const r of toDelete) {
      console.log(`  - ${r.name}`)
      await UserRoleConfig.destroy({ where: { roleId: r.id } })
      await LeadCampaignRoleToggle.destroy({ where: { roleId: r.id } })
      await UserCampaignAssignment.destroy({ where: { roleId: r.id } })
      await Role.destroy({ where: { id: r.id } })
    }
  }

  // Step 4 — final report
  const finalRoles = await Role.findAll({ order: [['name', 'ASC']], raw: true }) as unknown as Array<{ name: string }>
  console.log(`\nFinal role list (${finalRoles.length}):`)
  for (const r of finalRoles) console.log(`  ✓ ${r.name}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
