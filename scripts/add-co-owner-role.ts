/**
 * Idempotent: create the Co-Owner role if it doesn't exist.
 *
 * Usage: npx tsx scripts/add-co-owner-role.ts
 */
import 'reflect-metadata'
import { sequelize, Role } from '../packages/database/src'

const ALL_PERMISSIONS = [
  'admin.all',
  'leads.view', 'leads.create', 'leads.edit', 'leads.delete',
  'tm.view', 'tm.edit',
  'inventory.view', 'inventory.edit',
  'dispo.view', 'dispo.edit',
  'contacts.view', 'contacts.edit',
  'comms.view', 'comms.send',
  'tasks.view', 'tasks.manage',
  'campaigns.view', 'campaigns.manage',
  'analytics.view',
  'settings.view', 'settings.manage',
  'users.view', 'users.manage',
]

async function main() {
  const existing = await Role.findOne({ where: { name: 'Co-Owner' }, raw: true }) as any
  if (existing) {
    console.log('Co-Owner role already exists. Skipping.')
  } else {
    const created = await Role.create({
      name: 'Co-Owner',
      description: 'Co-owner with full operational access',
      permissions: ALL_PERMISSIONS,
      isSystem: true,
    } as any)
    console.log('Created Co-Owner role:', created.id)
  }

  const count = await Role.count()
  console.log(`Total roles: ${count}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
