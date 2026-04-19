/**
 * Seed script: Delete all existing leads and create 5 DTS + 5 DTA leads
 * Each lead gets a primary contact with name and phone.
 *
 * Usage: node scripts/seed-leads.mjs
 */
import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
})

const DTS_LEADS = [
  { street: '4500 Cedar Springs Rd', city: 'Dallas', state: 'TX', zip: '75219', stage: 'NEW_LEAD', contact: { first: 'James', last: 'Patterson', phone: '(214) 555-0101' } },
  { street: '1100 Harry Hines Blvd', city: 'Dallas', state: 'TX', zip: '75235', stage: 'DISCOVERY', contact: { first: 'Maria', last: 'Garcia', phone: '(214) 555-0202' } },
  { street: '3420 Oak Lawn Ave', city: 'Dallas', state: 'TX', zip: '75219', stage: 'INTERESTED_ADD_TO_FOLLOW_UP', contact: { first: 'Robert', last: 'Johnson', phone: '(469) 555-0303' } },
  { street: '7890 Lemmon Ave', city: 'Dallas', state: 'TX', zip: '75209', stage: 'OFFER_MADE', contact: { first: 'Sarah', last: 'Williams', phone: '(972) 555-0404' } },
  { street: '2200 Ross Ave', city: 'Dallas', state: 'TX', zip: '75201', stage: 'UNDER_CONTRACT', contact: { first: 'Michael', last: 'Brown', phone: '(214) 555-0505' } },
]

const DTA_LEADS = [
  { street: '4005 Sonora Dr', city: 'Plano', state: 'TX', zip: '75074', stage: 'NEW_LEAD', contact: { first: 'Soofia', last: 'Sheikh', phone: '(972) 375-4325' } },
  { street: '5775 Blairview St', city: 'Frisco', state: 'TX', zip: '75034', stage: 'DISCOVERY', contact: { first: 'Ahmad', last: 'Khan', phone: '(469) 555-0602' } },
  { street: '1820 Coit Rd', city: 'Richardson', state: 'TX', zip: '75080', stage: 'INTERESTED_ADD_TO_FOLLOW_UP', contact: { first: 'Jennifer', last: 'Davis', phone: '(972) 555-0703' } },
  { street: '3300 Preston Rd', city: 'Plano', state: 'TX', zip: '75093', stage: 'OFFER_MADE', contact: { first: 'Daniel', last: 'Martinez', phone: '(469) 555-0804' } },
  { street: '9100 Independence Pkwy', city: 'Plano', state: 'TX', zip: '75025', stage: 'DUE_DILIGENCE', contact: { first: 'Lisa', last: 'Anderson', phone: '(972) 555-0905' } },
]

function normalizeAddress(street, city, state, zip) {
  return [street, city, state, zip]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  // Get the admin user to use as creator
  const admin = await prisma.user.findFirst({ where: { status: 'ACTIVE' } })
  if (!admin) {
    console.error('No active user found. Run the base seed first.')
    process.exit(1)
  }
  console.log(`Using user: ${admin.name} (${admin.id})`)

  // Delete all existing data in order (respect foreign keys)
  console.log('Deleting existing data...')
  await prisma.buyerOffer.deleteMany()
  await prisma.buyerMatch.deleteMany()
  await prisma.leadOffer.deleteMany()
  await prisma.stageHistory.deleteMany()
  await prisma.activityLog.deleteMany()
  await prisma.propertyFile.deleteMany()
  await prisma.appointment.deleteMany()
  await prisma.task.deleteMany()
  await prisma.message.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.note.deleteMany()
  await prisma.propertyContact.deleteMany()
  await prisma.property.deleteMany()
  console.log('All existing property data deleted.')

  // Create DTS leads
  let count = 0
  for (const lead of DTS_LEADS) {
    count++
    const leadNumber = `HP-202604-${String(count).padStart(4, '0')}`
    await prisma.property.create({
      data: {
        streetAddress: lead.street,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        normalizedAddress: normalizeAddress(lead.street, lead.city, lead.state, lead.zip),
        leadType: 'DIRECT_TO_SELLER',
        activeLeadStage: lead.stage,
        createdById: admin.id,
        leadNumber,
        contacts: {
          create: {
            isPrimary: true,
            contact: {
              create: {
                type: 'SELLER',
                firstName: lead.contact.first,
                lastName: lead.contact.last,
                phone: lead.contact.phone,
              },
            },
          },
        },
        stageHistory: {
          create: {
            pipeline: 'leads',
            toStage: lead.stage,
            changedById: admin.id,
            changedByName: admin.name,
          },
        },
        activityLogs: {
          create: {
            userId: admin.id,
            action: 'LEAD_CREATED',
            detail: { description: 'Seeded via script' },
          },
        },
      },
    })
    console.log(`  DTS: ${lead.street}, ${lead.city} (${lead.stage})`)
  }

  // Create DTA leads
  for (const lead of DTA_LEADS) {
    count++
    const leadNumber = `HP-202604-${String(count).padStart(4, '0')}`
    await prisma.property.create({
      data: {
        streetAddress: lead.street,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        normalizedAddress: normalizeAddress(lead.street, lead.city, lead.state, lead.zip),
        leadType: 'DIRECT_TO_AGENT',
        activeLeadStage: lead.stage,
        createdById: admin.id,
        leadNumber,
        contacts: {
          create: {
            isPrimary: true,
            contact: {
              create: {
                type: 'AGENT',
                firstName: lead.contact.first,
                lastName: lead.contact.last,
                phone: lead.contact.phone,
              },
            },
          },
        },
        stageHistory: {
          create: {
            pipeline: 'leads',
            toStage: lead.stage,
            changedById: admin.id,
            changedByName: admin.name,
          },
        },
        activityLogs: {
          create: {
            userId: admin.id,
            action: 'LEAD_CREATED',
            detail: { description: 'Seeded via script' },
          },
        },
      },
    })
    console.log(`  DTA: ${lead.street}, ${lead.city} (${lead.stage})`)
  }

  console.log(`\nDone! Created ${count} leads (5 DTS + 5 DTA)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
