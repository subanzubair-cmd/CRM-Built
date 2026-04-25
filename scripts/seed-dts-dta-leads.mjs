/**
 * Wipe all leads and seed 10 DTS + 10 DTA leads.
 *
 * Every lead is wired to its campaign end-to-end:
 *   - leadCampaignId + campaignName  (links to DTS or DTA Test Campaign)
 *   - source                          (the campaign's lead source NAME)
 *   - defaultOutboundNumber           (the campaign's phone number)
 *
 * This mirrors what the UI would produce if you opened Add Lead, picked
 * the campaign, and let the form auto-fill source + outbound number.
 *
 * Usage: DATABASE_URL=... node scripts/seed-dts-dta-leads.mjs
 */
import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

function normalizeAddress(street, city, state, zip) {
  return [street, city, state, zip]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ACTIVE_STAGES = [
  'NEW_LEAD', 'DISCOVERY', 'INTERESTED_ADD_TO_FOLLOW_UP',
  'DUE_DILIGENCE', 'OFFER_MADE', 'OFFER_FOLLOW_UP', 'UNDER_CONTRACT',
  'NEW_LEAD', 'DISCOVERY', 'OFFER_MADE', // repeat to pad to 10
]

const DTS_LEADS = [
  { street: '4500 Cedar Springs Rd',   city: 'Dallas',     state: 'TX', zip: '75219', contact: { first: 'James',   last: 'Patterson',  phone: '(214) 555-0101' } },
  { street: '1100 Harry Hines Blvd',   city: 'Dallas',     state: 'TX', zip: '75235', contact: { first: 'Maria',   last: 'Garcia',     phone: '(214) 555-0202' } },
  { street: '3420 Oak Lawn Ave',       city: 'Dallas',     state: 'TX', zip: '75219', contact: { first: 'Robert',  last: 'Johnson',    phone: '(469) 555-0303' } },
  { street: '7890 Lemmon Ave',         city: 'Dallas',     state: 'TX', zip: '75209', contact: { first: 'Sarah',   last: 'Williams',   phone: '(972) 555-0404' } },
  { street: '2200 Ross Ave',           city: 'Dallas',     state: 'TX', zip: '75201', contact: { first: 'Michael', last: 'Brown',      phone: '(214) 555-0505' } },
  { street: '612 Elm St',              city: 'Dallas',     state: 'TX', zip: '75226', contact: { first: 'Thomas',  last: 'Wilson',     phone: '(214) 555-0606' } },
  { street: '818 Commerce St',         city: 'Dallas',     state: 'TX', zip: '75202', contact: { first: 'Karen',   last: 'Miller',     phone: '(214) 555-0707' } },
  { street: '2020 Main St',            city: 'Dallas',     state: 'TX', zip: '75201', contact: { first: 'Paul',    last: 'Moore',      phone: '(214) 555-0808' } },
  { street: '5400 E Mockingbird Ln',   city: 'Dallas',     state: 'TX', zip: '75206', contact: { first: 'Nancy',   last: 'Taylor',     phone: '(214) 555-0909' } },
  { street: '11111 N Central Expy',    city: 'Dallas',     state: 'TX', zip: '75243', contact: { first: 'Greg',    last: 'Jackson',    phone: '(214) 555-1010' } },
]

const DTA_LEADS = [
  { street: '4005 Sonora Dr',          city: 'Plano',      state: 'TX', zip: '75074', contact: { first: 'Soofia',  last: 'Sheikh',     phone: '(972) 375-4325' } },
  { street: '5775 Blairview St',       city: 'Frisco',     state: 'TX', zip: '75034', contact: { first: 'Ahmad',   last: 'Khan',       phone: '(469) 555-0602' } },
  { street: '1820 Coit Rd',            city: 'Richardson', state: 'TX', zip: '75080', contact: { first: 'Jennifer',last: 'Davis',      phone: '(972) 555-0703' } },
  { street: '3300 Preston Rd',         city: 'Plano',      state: 'TX', zip: '75093', contact: { first: 'Daniel',  last: 'Martinez',   phone: '(469) 555-0804' } },
  { street: '9100 Independence Pkwy',  city: 'Plano',      state: 'TX', zip: '75025', contact: { first: 'Lisa',    last: 'Anderson',   phone: '(972) 555-0905' } },
  { street: '5001 Belt Line Rd',       city: 'Addison',    state: 'TX', zip: '75001', contact: { first: 'Frank',   last: 'Allen',      phone: '(972) 555-1006' } },
  { street: '4200 N Dallas Pkwy',      city: 'Addison',    state: 'TX', zip: '75001', contact: { first: 'Gina',    last: 'Young',      phone: '(972) 555-1107' } },
  { street: '15360 Dallas Pkwy',       city: 'Dallas',     state: 'TX', zip: '75248', contact: { first: 'Henry',   last: 'King',       phone: '(972) 555-1208' } },
  { street: '3500 Maple Ave',          city: 'Dallas',     state: 'TX', zip: '75219', contact: { first: 'Iris',    last: 'Wright',     phone: '(972) 555-1309' } },
  { street: '8333 Douglas Ave',        city: 'Dallas',     state: 'TX', zip: '75225', contact: { first: 'Jack',    last: 'Lopez',      phone: '(972) 555-1410' } },
]

async function main() {
  const admin = await prisma.user.findFirst({ where: { status: 'ACTIVE' } })
  if (!admin) throw new Error('No active user found')

  const [dtsCampaign, dtaCampaign] = await Promise.all([
    prisma.leadCampaign.findFirst({
      where: { type: 'DTS', isActive: true },
      include: {
        leadSource: true,
        phoneNumber: true,
      },
    }),
    prisma.leadCampaign.findFirst({
      where: { type: 'DTA', isActive: true },
      include: {
        leadSource: true,
        phoneNumber: true,
      },
    }),
  ])

  if (!dtsCampaign) throw new Error('No active DTS campaign')
  if (!dtaCampaign) throw new Error('No active DTA campaign')

  if (!dtsCampaign.leadSource) throw new Error(`DTS campaign "${dtsCampaign.name}" has no lead source`)
  if (!dtaCampaign.leadSource) throw new Error(`DTA campaign "${dtaCampaign.name}" has no lead source`)
  if (!dtsCampaign.phoneNumber) throw new Error(`DTS campaign "${dtsCampaign.name}" has no phone number`)
  if (!dtaCampaign.phoneNumber) throw new Error(`DTA campaign "${dtaCampaign.name}" has no phone number`)

  const market = await prisma.market.findFirst({ where: { isActive: true } })

  console.log(`Admin:      ${admin.name} (${admin.id})`)
  console.log(`DTS campaign: ${dtsCampaign.name}`)
  console.log(`  source:     ${dtsCampaign.leadSource.name}`)
  console.log(`  phone:      ${dtsCampaign.phoneNumber.number} (${dtsCampaign.phoneNumber.friendlyName})`)
  console.log(`DTA campaign: ${dtaCampaign.name}`)
  console.log(`  source:     ${dtaCampaign.leadSource.name}`)
  console.log(`  phone:      ${dtaCampaign.phoneNumber.number} (${dtaCampaign.phoneNumber.friendlyName})`)
  console.log(`Market:       ${market?.name ?? '(none)'}\n`)

  // ── Wipe existing leads ────────────────────────────────────────────────────
  console.log('Wiping existing lead data…')
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
  try { await prisma.propertyTeamAssignment.deleteMany() } catch {}
  try { await prisma.campaignEnrollment.deleteMany() } catch {}
  try { await prisma.activeCall.deleteMany() } catch {}
  try { await prisma.aiLog.deleteMany() } catch {}
  await prisma.property.deleteMany()
  console.log('  ✓ All existing property data deleted\n')

  // ── Create DTS leads ───────────────────────────────────────────────────────
  const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '')
  let created = 0

  console.log(`Creating 10 DTS leads on "${dtsCampaign.name}"…`)
  for (let i = 0; i < DTS_LEADS.length; i++) {
    const lead = DTS_LEADS[i]
    const stage = ACTIVE_STAGES[i]
    const leadNumber = `HP-${yearMonth}-${String(created + 1).padStart(4, '0')}`
    await prisma.property.create({
      data: {
        streetAddress: lead.street,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        normalizedAddress: normalizeAddress(lead.street, lead.city, lead.state, lead.zip),
        leadType: 'DIRECT_TO_SELLER',
        leadStatus: 'ACTIVE',
        propertyStatus: 'LEAD',
        activeLeadStage: stage,
        leadCampaignId: dtsCampaign.id,
        campaignName: dtsCampaign.name,
        source: dtsCampaign.leadSource.name,
        defaultOutboundNumber: dtsCampaign.phoneNumber.number,
        marketId: market?.id ?? null,
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
            pipeline: 'dts',
            toStage: stage,
            changedById: admin.id,
            changedByName: admin.name,
          },
        },
        activityLogs: {
          create: {
            userId: admin.id,
            action: 'LEAD_CREATED',
            detail: { description: `Seeded DTS lead on ${dtsCampaign.name}` },
          },
        },
      },
    })
    created++
    console.log(`  [DTS #${i + 1}] ${lead.street}, ${lead.city} — ${lead.contact.first} ${lead.contact.last} (${stage})`)
  }

  // ── Create DTA leads ───────────────────────────────────────────────────────
  console.log(`\nCreating 10 DTA leads on "${dtaCampaign.name}"…`)
  for (let i = 0; i < DTA_LEADS.length; i++) {
    const lead = DTA_LEADS[i]
    const stage = ACTIVE_STAGES[i]
    const leadNumber = `HP-${yearMonth}-${String(created + 1).padStart(4, '0')}`
    await prisma.property.create({
      data: {
        streetAddress: lead.street,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        normalizedAddress: normalizeAddress(lead.street, lead.city, lead.state, lead.zip),
        leadType: 'DIRECT_TO_AGENT',
        leadStatus: 'ACTIVE',
        propertyStatus: 'LEAD',
        activeLeadStage: stage,
        leadCampaignId: dtaCampaign.id,
        campaignName: dtaCampaign.name,
        source: dtaCampaign.leadSource.name,
        defaultOutboundNumber: dtaCampaign.phoneNumber.number,
        marketId: market?.id ?? null,
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
            pipeline: 'dta',
            toStage: stage,
            changedById: admin.id,
            changedByName: admin.name,
          },
        },
        activityLogs: {
          create: {
            userId: admin.id,
            action: 'LEAD_CREATED',
            detail: { description: `Seeded DTA lead on ${dtaCampaign.name}` },
          },
        },
      },
    })
    created++
    console.log(`  [DTA #${i + 1}] ${lead.street}, ${lead.city} — ${lead.contact.first} ${lead.contact.last} (${stage})`)
  }

  console.log(`\n✓ Created ${created} leads (10 DTS + 10 DTA)`)
  console.log(`\nEach DTS lead:  source="${dtsCampaign.leadSource.name}"  outbound=${dtsCampaign.phoneNumber.number}`)
  console.log(`Each DTA lead:  source="${dtaCampaign.leadSource.name}"  outbound=${dtaCampaign.phoneNumber.number}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
