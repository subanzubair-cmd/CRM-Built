import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
const result = await prisma.leadCampaign.updateMany({
  where: { type: 'SELLERS' },
  data: { type: 'DTS' },
})
console.log(`Converted ${result.count} SELLERS campaign(s) to DTS`)
await prisma.$disconnect()
