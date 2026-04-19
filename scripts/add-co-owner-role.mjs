import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

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
  const existing = await prisma.role.findUnique({ where: { name: 'Co-Owner' } })
  if (existing) {
    console.log('Co-Owner role already exists. Skipping.')
  } else {
    const created = await prisma.role.create({
      data: {
        name: 'Co-Owner',
        description: 'Co-owner with full operational access',
        permissions: ALL_PERMISSIONS,
        isSystem: true,
      },
    })
    console.log('Created Co-Owner role:', created.id)
  }

  const count = await prisma.role.count()
  console.log(`Total roles: ${count}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
