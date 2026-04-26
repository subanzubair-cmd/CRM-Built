/**
 * Seed script: Delete all existing leads and create 5 DTS + 5 DTA leads.
 * Each lead gets a primary contact with name and phone.
 *
 * Usage: npx tsx scripts/seed-leads.ts
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
  BuyerOffer,
  BuyerMatch,
  LeadOffer,
  PropertyFile,
  Appointment,
  Task,
  Message,
  Conversation,
  Note,
} from '../packages/database/src'

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

function normalizeAddress(street: string, city: string, state: string, zip: string): string {
  return [street, city, state, zip]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function createLead(
  lead: typeof DTS_LEADS[number],
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT',
  contactType: 'SELLER' | 'AGENT',
  leadNumber: string,
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
      activeLeadStage: lead.stage,
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
      pipeline: 'leads',
      toStage: lead.stage,
      changedById: admin.id,
      changedByName: admin.name,
    } as any, { transaction: tx })

    await ActivityLog.create({
      propertyId: property.id,
      userId: admin.id,
      action: 'LEAD_CREATED',
      detail: { description: 'Seeded via script' },
    } as any, { transaction: tx })
  })
}

async function main() {
  const admin = await User.findOne({ where: { status: 'ACTIVE' }, raw: true }) as any
  if (!admin) {
    console.error('No active user found. Run the base seed first.')
    process.exit(1)
  }
  console.log(`Using user: ${admin.name} (${admin.id})`)

  console.log('Deleting existing data...')
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
  await Property.destroy({ where: {} })
  console.log('All existing property data deleted.')

  let count = 0
  for (const lead of DTS_LEADS) {
    count++
    const leadNumber = `HP-202604-${String(count).padStart(4, '0')}`
    await createLead(lead, 'DIRECT_TO_SELLER', 'SELLER', leadNumber, admin)
    console.log(`  DTS: ${lead.street}, ${lead.city} (${lead.stage})`)
  }

  for (const lead of DTA_LEADS) {
    count++
    const leadNumber = `HP-202604-${String(count).padStart(4, '0')}`
    await createLead(lead, 'DIRECT_TO_AGENT', 'AGENT', leadNumber, admin)
    console.log(`  DTA: ${lead.street}, ${lead.city} (${lead.stage})`)
  }

  console.log(`\nDone! Created ${count} leads (5 DTS + 5 DTA)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
