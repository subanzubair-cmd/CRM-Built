import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
const admin = await prisma.role.findUnique({ where: { name: 'Admin' } })
const updated = await prisma.user.updateMany({
  where: { email: 'admin@homewardpartners.com' },
  data: { roleId: admin.id },
})
console.log(`Reassigned ${updated.count} user(s) to Admin role`)
await prisma.$disconnect()
