/**
 * Quick-fire seed: 10 ready-to-edit Property rows (5 DTS + 5 DTA) with
 * common attributes. Skips contacts/stage history — use scripts/seed-leads.ts
 * for a richer seed.
 *
 * Usage: npx tsx seed-leads.ts
 */
import 'reflect-metadata'
import { sequelize, User, Market, Property } from './packages/database/src'

const leads = [
  // 5 DTS leads
  { streetAddress: '1200 Elm St', city: 'Dallas', state: 'TX', zip: '75270', leadType: 'DIRECT_TO_SELLER', activeLeadStage: 'NEW_LEAD', source: 'Direct Mail', campaignName: 'Spring Mailer', askingPrice: 185000, arv: 245000, bedrooms: 3, bathrooms: 2, sqft: 1800, yearBuilt: 1985 },
  { streetAddress: '3420 Oak Lawn Ave', city: 'Dallas', state: 'TX', zip: '75219', leadType: 'DIRECT_TO_SELLER', activeLeadStage: 'DISCOVERY', source: 'PPC', campaignName: 'Google Ads Q2', askingPrice: 320000, arv: 410000, bedrooms: 4, bathrooms: 3, sqft: 2400, yearBuilt: 1998 },
  { streetAddress: '5678 Mockingbird Ln', city: 'Dallas', state: 'TX', zip: '75206', leadType: 'DIRECT_TO_SELLER', activeLeadStage: 'APPOINTMENT_MADE', source: 'Driving for Dollars', askingPrice: 275000, arv: 350000, bedrooms: 3, bathrooms: 2, sqft: 2100, yearBuilt: 1972 },
  { streetAddress: '901 Swiss Ave', city: 'Dallas', state: 'TX', zip: '75204', leadType: 'DIRECT_TO_SELLER', activeLeadStage: 'OFFER_MADE', source: 'Referral', askingPrice: 195000, arv: 280000, bedrooms: 2, bathrooms: 1, sqft: 1400, yearBuilt: 1960 },
  { streetAddress: '2200 Ross Ave', city: 'Dallas', state: 'TX', zip: '75201', leadType: 'DIRECT_TO_SELLER', activeLeadStage: 'DUE_DILIGENCE', source: 'Cold Call', campaignName: 'Cold Call Blitz', askingPrice: 150000, arv: 220000, bedrooms: 3, bathrooms: 2, sqft: 1600, yearBuilt: 1978 },
  // 5 DTA leads
  { streetAddress: '4500 Cedar Springs Rd', city: 'Dallas', state: 'TX', zip: '75219', leadType: 'DIRECT_TO_AGENT', activeLeadStage: 'NEW_LEAD', source: 'Agent Referral', campaignName: 'Agent Outreach', askingPrice: 425000, arv: 500000, bedrooms: 4, bathrooms: 3, sqft: 3200, yearBuilt: 2005 },
  { streetAddress: '7890 Lemmon Ave', city: 'Dallas', state: 'TX', zip: '75209', leadType: 'DIRECT_TO_AGENT', activeLeadStage: 'INTERESTED_ADD_TO_FOLLOW_UP', source: 'MLS', askingPrice: 289000, arv: 340000, bedrooms: 3, bathrooms: 2, sqft: 2000, yearBuilt: 1990 },
  { streetAddress: '1100 Harry Hines Blvd', city: 'Dallas', state: 'TX', zip: '75235', leadType: 'DIRECT_TO_AGENT', activeLeadStage: 'DUE_DILIGENCE', source: 'Zillow', askingPrice: 210000, arv: 290000, bedrooms: 3, bathrooms: 2, sqft: 1700, yearBuilt: 1982 },
  { streetAddress: '3300 Gaston Ave', city: 'Dallas', state: 'TX', zip: '75246', leadType: 'DIRECT_TO_AGENT', activeLeadStage: 'OFFER_FOLLOW_UP', source: 'Agent Network', askingPrice: 175000, arv: 250000, bedrooms: 2, bathrooms: 1, sqft: 1200, yearBuilt: 1965 },
  { streetAddress: '6200 Skillman St', city: 'Dallas', state: 'TX', zip: '75231', leadType: 'DIRECT_TO_AGENT', activeLeadStage: 'APPOINTMENT_MADE', source: 'Networking Event', askingPrice: 340000, arv: 420000, bedrooms: 4, bathrooms: 3, sqft: 2600, yearBuilt: 2001 },
]

async function main() {
  const user = await User.findOne({ where: { status: 'ACTIVE' }, raw: true }) as any
  const market = await Market.findOne({ raw: true }) as any
  if (!user) {
    console.log('No active user')
    process.exit(1)
  }

  const month = new Date().toISOString().slice(0, 7).replace('-', '')
  let count = 0
  for (const lead of leads) {
    count++
    const leadNumber = `HP-${month}-${String(count).padStart(4, '0')}`
    const na = `${lead.streetAddress} ${lead.city} ${lead.state}`.toLowerCase().replace(/[^a-z0-9]/g, '')
    await Property.create({
      ...lead,
      leadStatus: 'ACTIVE',
      propertyStatus: 'LEAD',
      leadNumber,
      normalizedAddress: na,
      assignedToId: user.id,
      createdById: user.id,
      marketId: market?.id ?? null,
    } as any)
  }
  console.log(`${count} leads created (5 DTS + 5 DTA)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
