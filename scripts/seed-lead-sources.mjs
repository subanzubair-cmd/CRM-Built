import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const DEFAULTS = [
  'Bandit Signs',
  'Billboard',
  'Cold Calling',
  'Craigslist',
  'Direct Mail',
  'Door Knocking',
  'Driving for Dollars',
  'Email Marketing',
  'Facebook Marketing',
  'For Sale by Owner',
  'Foreclosure Auction',
  'Google Adwords/PPC',
  'HVA',
  'Internet Marketing (SEO)',
  'MLS',
  'Magnetic Signs',
  'Newspaper',
  'Online Auction',
  'Other',
]

async function main() {
  for (const name of DEFAULTS) {
    await prisma.leadSource.upsert({
      where: { name },
      create: { name, isSystem: true, isActive: true },
      update: { isSystem: true },
    })
  }
  const count = await prisma.leadSource.count()
  console.log(`Seeded ${DEFAULTS.length} system lead sources. Total in DB: ${count}.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
