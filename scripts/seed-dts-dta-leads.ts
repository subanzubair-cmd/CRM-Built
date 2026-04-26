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
 * Usage: DATABASE_URL=... npx tsx scripts/seed-dts-dta-leads.ts
 */
import 'reflect-metadata'
import {
  sequelize,
  User,
  Property,
  Contact,
  PropertyContact,
  StageHistory,
  ActivityLog,
  Market,
  LeadCampaign,
  LeadSource,
  TwilioNumber,
  BuyerOffer,
  BuyerMatch,
  LeadOffer,
  PropertyFile,
  Appointment,
  Task,
  Message,
  Conversation,
  Note,
  PropertyTeamAssignment,
  CampaignEnrollment,
  ActiveCall,
  AiLog,
} from '../packages/database/src'

function normalizeAddress(street: string, city: string, state: string, zip: string): string {
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
  'NEW_LEAD', 'DISCOVERY', 'OFFER_MADE',
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

interface CampaignContext {
  id: string
  name: string
  leadSource: { name: string }
  phoneNumber: { number: string; friendlyName: string }
}

async function loadCampaign(type: 'DTS' | 'DTA'): Promise<CampaignContext> {
  const row = await LeadCampaign.findOne({
    where: { type, isActive: true },
    include: [
      { model: LeadSource, as: 'leadSource' },
      { model: TwilioNumber, as: 'phoneNumber' },
    ],
  })
  if (!row) throw new Error(`No active ${type} campaign`)
  const plain = row.get({ plain: true }) as any
  if (!plain.leadSource) throw new Error(`${type} campaign "${plain.name}" has no lead source`)
  if (!plain.phoneNumber) throw new Error(`${type} campaign "${plain.name}" has no phone number`)
  return plain as CampaignContext
}

async function createLead(
  lead: { street: string; city: string; state: string; zip: string; contact: { first: string; last: string; phone: string } },
  stage: string,
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT',
  contactType: 'SELLER' | 'AGENT',
  pipeline: 'dts' | 'dta',
  leadNumber: string,
  campaign: CampaignContext,
  marketId: string | null,
  admin: { id: string; name: string },
) {
  await sequelize.transaction(async (tx) => {
    const property = await Property.create({
      streetAddress: lead.street,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      normalizedAddress: normalizeAddress(lead.street, lead.city, lead.state, lead.zip),
      leadType,
      leadStatus: 'ACTIVE',
      propertyStatus: 'LEAD',
      activeLeadStage: stage,
      leadCampaignId: campaign.id,
      campaignName: campaign.name,
      source: campaign.leadSource.name,
      defaultOutboundNumber: campaign.phoneNumber.number,
      marketId,
      createdById: admin.id,
      leadNumber,
    } as any, { transaction: tx })

    const contact = await Contact.create({
      type: contactType,
      firstName: lead.contact.first,
      lastName: lead.contact.last,
      phone: lead.contact.phone,
    } as any, { transaction: tx })

    await PropertyContact.create({
      propertyId: property.id,
      contactId: contact.id,
      isPrimary: true,
    } as any, { transaction: tx })

    await StageHistory.create({
      propertyId: property.id,
      pipeline,
      toStage: stage,
      changedById: admin.id,
      changedByName: admin.name,
    } as any, { transaction: tx })

    await ActivityLog.create({
      propertyId: property.id,
      userId: admin.id,
      action: 'LEAD_CREATED',
      detail: { description: `Seeded ${pipeline.toUpperCase()} lead on ${campaign.name}` },
    } as any, { transaction: tx })
  })
}

async function main() {
  const admin = await User.findOne({ where: { status: 'ACTIVE' }, raw: true }) as any
  if (!admin) throw new Error('No active user found')

  const [dtsCampaign, dtaCampaign] = await Promise.all([loadCampaign('DTS'), loadCampaign('DTA')])
  const market = await Market.findOne({ where: { isActive: true }, raw: true }) as any
  const marketId = market?.id ?? null

  console.log(`Admin:      ${admin.name} (${admin.id})`)
  console.log(`DTS campaign: ${dtsCampaign.name}`)
  console.log(`  source:     ${dtsCampaign.leadSource.name}`)
  console.log(`  phone:      ${dtsCampaign.phoneNumber.number} (${dtsCampaign.phoneNumber.friendlyName})`)
  console.log(`DTA campaign: ${dtaCampaign.name}`)
  console.log(`  source:     ${dtaCampaign.leadSource.name}`)
  console.log(`  phone:      ${dtaCampaign.phoneNumber.number} (${dtaCampaign.phoneNumber.friendlyName})`)
  console.log(`Market:       ${market?.name ?? '(none)'}\n`)

  console.log('Wiping existing lead data…')
  await BuyerOffer.destroy({ where: {} })
  await BuyerMatch.destroy({ where: {} })
  await LeadOffer.destroy({ where: {} })
  await StageHistory.destroy({ where: {} })
  await ActivityLog.destroy({ where: {} })
  await PropertyFile.destroy({ where: {} })
  await Appointment.destroy({ where: {} })
  await Task.destroy({ where: {} })
  await Message.destroy({ where: {} })
  await Conversation.destroy({ where: {} })
  await Note.destroy({ where: {} })
  await PropertyContact.destroy({ where: {} })
  try { await PropertyTeamAssignment.destroy({ where: {} }) } catch {}
  try { await CampaignEnrollment.destroy({ where: {} }) } catch {}
  try { await ActiveCall.destroy({ where: {} }) } catch {}
  try { await AiLog.destroy({ where: {} }) } catch {}
  await Property.destroy({ where: {} })
  console.log('  ✓ All existing property data deleted\n')

  const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '')
  let created = 0

  console.log(`Creating 10 DTS leads on "${dtsCampaign.name}"…`)
  for (let i = 0; i < DTS_LEADS.length; i++) {
    const lead = DTS_LEADS[i]
    const stage = ACTIVE_STAGES[i]
    const leadNumber = `HP-${yearMonth}-${String(created + 1).padStart(4, '0')}`
    await createLead(lead, stage, 'DIRECT_TO_SELLER', 'SELLER', 'dts', leadNumber, dtsCampaign, marketId, admin)
    created++
    console.log(`  [DTS #${i + 1}] ${lead.street}, ${lead.city} — ${lead.contact.first} ${lead.contact.last} (${stage})`)
  }

  console.log(`\nCreating 10 DTA leads on "${dtaCampaign.name}"…`)
  for (let i = 0; i < DTA_LEADS.length; i++) {
    const lead = DTA_LEADS[i]
    const stage = ACTIVE_STAGES[i]
    const leadNumber = `HP-${yearMonth}-${String(created + 1).padStart(4, '0')}`
    await createLead(lead, stage, 'DIRECT_TO_AGENT', 'AGENT', 'dta', leadNumber, dtaCampaign, marketId, admin)
    created++
    console.log(`  [DTA #${i + 1}] ${lead.street}, ${lead.city} — ${lead.contact.first} ${lead.contact.last} (${stage})`)
  }

  console.log(`\n✓ Created ${created} leads (10 DTS + 10 DTA)`)
  console.log(`\nEach DTS lead:  source="${dtsCampaign.leadSource.name}"  outbound=${dtsCampaign.phoneNumber.number}`)
  console.log(`Each DTA lead:  source="${dtaCampaign.leadSource.name}"  outbound=${dtaCampaign.phoneNumber.number}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
