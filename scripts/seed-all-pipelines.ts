/**
 * Wipe all existing leads and seed 5 leads in each of the 10 pipelines.
 * Uses the existing DTS Test Campaign / DTA Test Campaign.
 *
 * Pipelines:
 *   1. DTS       (Direct to Seller — active, with stage)
 *   2. DTA       (Direct to Agent — active, with stage)
 *   3. Warm      (leadStatus=WARM)
 *   4. Dead      (leadStatus=DEAD)
 *   5. Referred  (leadStatus=REFERRED_TO_AGENT)
 *   6. TM        (propertyStatus=IN_TM, tmStage set)
 *   7. Inventory (propertyStatus=IN_INVENTORY, inventoryStage set)
 *   8. Dispo     (propertyStatus=IN_DISPO)
 *   9. Sold      (propertyStatus=SOLD, soldAt + soldPrice)
 *  10. Rental    (propertyStatus=RENTAL, rentalAt)
 *
 * Usage: DATABASE_URL=... npx tsx scripts/seed-all-pipelines.ts
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

const ADDRESSES: Array<[string, string, string, string]> = [
  // DTS (0-4)
  ['4500 Cedar Springs Rd', 'Dallas', 'TX', '75219'],
  ['1100 Harry Hines Blvd', 'Dallas', 'TX', '75235'],
  ['3420 Oak Lawn Ave', 'Dallas', 'TX', '75219'],
  ['7890 Lemmon Ave', 'Dallas', 'TX', '75209'],
  ['2200 Ross Ave', 'Dallas', 'TX', '75201'],
  // DTA (5-9)
  ['4005 Sonora Dr', 'Plano', 'TX', '75074'],
  ['5775 Blairview St', 'Frisco', 'TX', '75034'],
  ['1820 Coit Rd', 'Richardson', 'TX', '75080'],
  ['3300 Preston Rd', 'Plano', 'TX', '75093'],
  ['9100 Independence Pkwy', 'Plano', 'TX', '75025'],
  // Warm (10-14)
  ['612 Elm St', 'Dallas', 'TX', '75226'],
  ['818 Commerce St', 'Dallas', 'TX', '75202'],
  ['2020 Main St', 'Dallas', 'TX', '75201'],
  ['5400 E Mockingbird Ln', 'Dallas', 'TX', '75206'],
  ['11111 N Central Expy', 'Dallas', 'TX', '75243'],
  // Dead (15-19)
  ['303 S Beckley Ave', 'Dallas', 'TX', '75203'],
  ['4141 N Fitzhugh Ave', 'Dallas', 'TX', '75204'],
  ['7575 Skillman St', 'Dallas', 'TX', '75231'],
  ['9090 W Northwest Hwy', 'Dallas', 'TX', '75220'],
  ['2500 Abrams Rd', 'Dallas', 'TX', '75214'],
  // Referred (20-24)
  ['5001 Belt Line Rd', 'Addison', 'TX', '75001'],
  ['4200 N Dallas Pkwy', 'Addison', 'TX', '75001'],
  ['15360 Dallas Pkwy', 'Dallas', 'TX', '75248'],
  ['3500 Maple Ave', 'Dallas', 'TX', '75219'],
  ['8333 Douglas Ave', 'Dallas', 'TX', '75225'],
  // TM (25-29)
  ['2828 Routh St', 'Dallas', 'TX', '75201'],
  ['1717 Fairmount St', 'Dallas', 'TX', '75201'],
  ['5850 Legacy Cir', 'Plano', 'TX', '75024'],
  ['6060 N Central Expy', 'Dallas', 'TX', '75206'],
  ['2401 Victory Ave', 'Dallas', 'TX', '75219'],
  // Inventory (30-34)
  ['4111 W Lovers Ln', 'Dallas', 'TX', '75209'],
  ['5555 Mockingbird Ln', 'Dallas', 'TX', '75206'],
  ['7722 Walnut Hill Ln', 'Dallas', 'TX', '75230'],
  ['9999 Audelia Rd', 'Dallas', 'TX', '75238'],
  ['1300 Inwood Rd', 'Dallas', 'TX', '75247'],
  // Dispo (35-39)
  ['2424 Greenville Ave', 'Dallas', 'TX', '75206'],
  ['3737 Lemmon Ave', 'Dallas', 'TX', '75219'],
  ['4545 Ross Ave', 'Dallas', 'TX', '75204'],
  ['6600 LBJ Fwy', 'Dallas', 'TX', '75240'],
  ['8181 Park Ln', 'Dallas', 'TX', '75231'],
  // Sold (40-44)
  ['1010 S Akard St', 'Dallas', 'TX', '75215'],
  ['2200 McKinney Ave', 'Dallas', 'TX', '75201'],
  ['3300 Welborn St', 'Dallas', 'TX', '75219'],
  ['4400 Gaston Ave', 'Dallas', 'TX', '75246'],
  ['5500 Swiss Ave', 'Dallas', 'TX', '75214'],
  // Rental (45-49)
  ['6600 Hillcrest Ave', 'Dallas', 'TX', '75205'],
  ['7700 W Northwest Hwy', 'Dallas', 'TX', '75225'],
  ['8800 Midway Rd', 'Dallas', 'TX', '75209'],
  ['9900 Forest Ln', 'Dallas', 'TX', '75243'],
  ['1050 Preston Trail', 'Dallas', 'TX', '75230'],
]

const CONTACTS: Array<{ first: string; last: string; phone: string }> = [
  // DTS sellers
  { first: 'James', last: 'Patterson',  phone: '(214) 555-0101' },
  { first: 'Maria', last: 'Garcia',     phone: '(214) 555-0202' },
  { first: 'Robert',last: 'Johnson',    phone: '(469) 555-0303' },
  { first: 'Sarah', last: 'Williams',   phone: '(972) 555-0404' },
  { first: 'Michael',last:'Brown',      phone: '(214) 555-0505' },
  // DTA agents
  { first: 'Soofia',last:'Sheikh',      phone: '(972) 375-4325' },
  { first: 'Ahmad', last: 'Khan',       phone: '(469) 555-0602' },
  { first: 'Jennifer',last:'Davis',     phone: '(972) 555-0703' },
  { first: 'Daniel',last: 'Martinez',   phone: '(469) 555-0804' },
  { first: 'Lisa',  last: 'Anderson',   phone: '(972) 555-0905' },
  // Warm sellers
  { first: 'Thomas',last: 'Wilson',     phone: '(214) 555-1001' },
  { first: 'Karen', last: 'Miller',     phone: '(214) 555-1002' },
  { first: 'Paul',  last: 'Moore',      phone: '(214) 555-1003' },
  { first: 'Nancy', last: 'Taylor',     phone: '(214) 555-1004' },
  { first: 'Greg',  last: 'Jackson',    phone: '(214) 555-1005' },
  // Dead sellers
  { first: 'Angela',last: 'White',      phone: '(214) 555-1101' },
  { first: 'Brian', last: 'Harris',     phone: '(214) 555-1102' },
  { first: 'Cindy', last: 'Lewis',      phone: '(214) 555-1103' },
  { first: 'Derek', last: 'Walker',     phone: '(214) 555-1104' },
  { first: 'Ella',  last: 'Hall',       phone: '(214) 555-1105' },
  // Referred agents
  { first: 'Frank', last: 'Allen',      phone: '(214) 555-1201' },
  { first: 'Gina',  last: 'Young',      phone: '(214) 555-1202' },
  { first: 'Henry', last: 'King',       phone: '(214) 555-1203' },
  { first: 'Iris',  last: 'Wright',     phone: '(214) 555-1204' },
  { first: 'Jack',  last: 'Lopez',      phone: '(214) 555-1205' },
  // TM sellers
  { first: 'Kelly', last: 'Hill',       phone: '(214) 555-1301' },
  { first: 'Luis',  last: 'Green',      phone: '(214) 555-1302' },
  { first: 'Mia',   last: 'Adams',      phone: '(214) 555-1303' },
  { first: 'Noah',  last: 'Nelson',     phone: '(214) 555-1304' },
  { first: 'Olivia',last: 'Carter',     phone: '(214) 555-1305' },
  // Inventory sellers
  { first: 'Pete',  last: 'Mitchell',   phone: '(214) 555-1401' },
  { first: 'Quinn', last: 'Perez',      phone: '(214) 555-1402' },
  { first: 'Rita',  last: 'Roberts',    phone: '(214) 555-1403' },
  { first: 'Sam',   last: 'Turner',     phone: '(214) 555-1404' },
  { first: 'Tina',  last: 'Phillips',   phone: '(214) 555-1405' },
  // Dispo sellers
  { first: 'Uma',   last: 'Campbell',   phone: '(214) 555-1501' },
  { first: 'Victor',last: 'Parker',     phone: '(214) 555-1502' },
  { first: 'Wendy', last: 'Evans',      phone: '(214) 555-1503' },
  { first: 'Xander',last: 'Edwards',    phone: '(214) 555-1504' },
  { first: 'Yara',  last: 'Collins',    phone: '(214) 555-1505' },
  // Sold sellers
  { first: 'Zach',  last: 'Stewart',    phone: '(214) 555-1601' },
  { first: 'Amy',   last: 'Sanchez',    phone: '(214) 555-1602' },
  { first: 'Ben',   last: 'Morris',     phone: '(214) 555-1603' },
  { first: 'Chloe', last: 'Rogers',     phone: '(214) 555-1604' },
  { first: 'Dean',  last: 'Reed',       phone: '(214) 555-1605' },
  // Rental sellers
  { first: 'Eva',   last: 'Cook',       phone: '(214) 555-1701' },
  { first: 'Finn',  last: 'Bailey',     phone: '(214) 555-1702' },
  { first: 'Grace', last: 'Bell',       phone: '(214) 555-1703' },
  { first: 'Hugo',  last: 'Murphy',     phone: '(214) 555-1704' },
  { first: 'Ivy',   last: 'Rivera',     phone: '(214) 555-1705' },
]

const ACTIVE_STAGES = ['NEW_LEAD', 'DISCOVERY', 'INTERESTED_ADD_TO_FOLLOW_UP', 'OFFER_MADE', 'UNDER_CONTRACT']
const TM_STAGES = ['NEW_CONTRACT', 'MARKETING_TO_BUYERS', 'SHOWING_TO_BUYERS', 'EVALUATING_OFFERS', 'ACCEPTED_OFFER']
const INV_STAGES = ['NEW_INVENTORY', 'GETTING_ESTIMATES', 'UNDER_REHAB', 'LISTED_FOR_SALE', 'UNDER_CONTRACT']

interface PipelineConfig {
  idx: number
  pipeline: string
  contactType: 'SELLER' | 'AGENT'
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  leadStatus: string
  propertyStatus: string
  activeLeadStage: string | null
  tmStage?: string
  inventoryStage?: string
  exitStrategy?: string
  inDispo?: boolean
  underContractAt?: Date
  underContractPrice?: number
  contractPrice?: number
  arv?: number
  repairEstimate?: number
  askingPrice?: number
  soldAt?: Date
  soldPrice?: number
  offerPrice?: number
  rentalAt?: Date
  warmAt?: Date
  deadAt?: Date
  referredAt?: Date
  leadCampaignId: string
  campaignName: string
}

async function main() {
  const admin = await User.findOne({ where: { status: 'ACTIVE' }, raw: true }) as any
  if (!admin) throw new Error('No active user found')

  const [dtsCampaignRow, dtaCampaignRow] = await Promise.all([
    LeadCampaign.findOne({ where: { type: 'DTS', isActive: true }, raw: true }) as Promise<any>,
    LeadCampaign.findOne({ where: { type: 'DTA', isActive: true }, raw: true }) as Promise<any>,
  ])
  const dtsCampaign = dtsCampaignRow
  const dtaCampaign = dtaCampaignRow
  if (!dtsCampaign) throw new Error('No active DTS campaign found')
  if (!dtaCampaign) throw new Error('No active DTA campaign found')

  const market = await Market.findOne({ where: { isActive: true }, raw: true }) as any
  const marketId = market?.id ?? null

  console.log(`Admin:    ${admin.name} (${admin.id})`)
  console.log(`DTS camp: ${dtsCampaign.name} (${dtsCampaign.id})`)
  console.log(`DTA camp: ${dtaCampaign.name} (${dtaCampaign.id})`)
  console.log(`Market:   ${market?.name ?? '(none)'}`)
  console.log('')

  // ── Wipe all existing leads ────────────────────────────────────────────────
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
  // Orphan contacts are left in place — they may be linked to Buyer/Vendor/Conversation
  // rows and deleting them cascades unpredictably. Seed creates fresh contacts below.
  console.log('  ✓ All existing property data deleted\n')

  // ── Pipeline configs ───────────────────────────────────────────────────────
  const pipelines: PipelineConfig[] = [
    // DTS — active seller leads
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => ({
      idx: i,
      pipeline: 'dts',
      contactType: 'SELLER',
      leadType: 'DIRECT_TO_SELLER',
      leadStatus: 'ACTIVE',
      propertyStatus: 'LEAD',
      activeLeadStage: ACTIVE_STAGES[i],
      leadCampaignId: dtsCampaign.id,
      campaignName: dtsCampaign.name,
    })),
    // DTA — active agent leads
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => ({
      idx: 5 + i,
      pipeline: 'dta',
      contactType: 'AGENT',
      leadType: 'DIRECT_TO_AGENT',
      leadStatus: 'ACTIVE',
      propertyStatus: 'LEAD',
      activeLeadStage: ACTIVE_STAGES[i],
      leadCampaignId: dtaCampaign.id,
      campaignName: dtaCampaign.name,
    })),
    // Warm — alternating DTS/DTA
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => {
      const isDts = i % 2 === 0
      return {
        idx: 10 + i,
        pipeline: 'warm',
        contactType: isDts ? 'SELLER' : 'AGENT',
        leadType: isDts ? 'DIRECT_TO_SELLER' : 'DIRECT_TO_AGENT',
        leadStatus: 'WARM',
        propertyStatus: 'WARM',
        activeLeadStage: null,
        warmAt: new Date(),
        leadCampaignId: isDts ? dtsCampaign.id : dtaCampaign.id,
        campaignName: isDts ? dtsCampaign.name : dtaCampaign.name,
      }
    }),
    // Dead — mostly DTS
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => ({
      idx: 15 + i,
      pipeline: 'dead',
      contactType: 'SELLER',
      leadType: 'DIRECT_TO_SELLER',
      leadStatus: 'DEAD',
      propertyStatus: 'DEAD',
      activeLeadStage: null,
      deadAt: new Date(),
      leadCampaignId: dtsCampaign.id,
      campaignName: dtsCampaign.name,
    })),
    // Referred — DTA-leaning
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => {
      const isDta = i % 2 === 0
      return {
        idx: 20 + i,
        pipeline: 'referred',
        contactType: isDta ? 'AGENT' : 'SELLER',
        leadType: isDta ? 'DIRECT_TO_AGENT' : 'DIRECT_TO_SELLER',
        leadStatus: 'REFERRED_TO_AGENT',
        propertyStatus: 'REFERRED',
        activeLeadStage: null,
        referredAt: new Date(),
        leadCampaignId: isDta ? dtaCampaign.id : dtsCampaign.id,
        campaignName: isDta ? dtaCampaign.name : dtsCampaign.name,
      }
    }),
    // TM — all DTS-origin
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => ({
      idx: 25 + i,
      pipeline: 'tm',
      contactType: 'SELLER',
      leadType: 'DIRECT_TO_SELLER',
      leadStatus: 'ACTIVE',
      propertyStatus: 'IN_TM',
      activeLeadStage: 'UNDER_CONTRACT',
      tmStage: TM_STAGES[i],
      exitStrategy: 'WHOLESALE_ASSIGNMENT',
      underContractAt: new Date(),
      underContractPrice: 185000 + i * 15000,
      contractPrice: 185000 + i * 15000,
      leadCampaignId: dtsCampaign.id,
      campaignName: dtsCampaign.name,
    })),
    // Inventory — DTS-origin properties being rehabbed / flipped
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => ({
      idx: 30 + i,
      pipeline: 'inventory',
      contactType: 'SELLER',
      leadType: 'DIRECT_TO_SELLER',
      leadStatus: 'ACTIVE',
      propertyStatus: 'IN_INVENTORY',
      activeLeadStage: 'UNDER_CONTRACT',
      inventoryStage: INV_STAGES[i],
      exitStrategy: 'FIX_AND_FLIP',
      underContractAt: new Date(),
      underContractPrice: 210000 + i * 20000,
      arv: 295000 + i * 25000,
      repairEstimate: 35000 + i * 5000,
      leadCampaignId: dtsCampaign.id,
      campaignName: dtsCampaign.name,
    })),
    // Dispo — DTS-origin being marketed to buyers
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => ({
      idx: 35 + i,
      pipeline: 'dispo',
      contactType: 'SELLER',
      leadType: 'DIRECT_TO_SELLER',
      leadStatus: 'ACTIVE',
      propertyStatus: 'IN_DISPO',
      activeLeadStage: 'UNDER_CONTRACT',
      exitStrategy: 'WHOLESALE_ASSIGNMENT',
      inDispo: true,
      underContractAt: new Date(),
      underContractPrice: 175000 + i * 12000,
      askingPrice: 220000 + i * 15000,
      arv: 275000 + i * 18000,
      leadCampaignId: dtsCampaign.id,
      campaignName: dtsCampaign.name,
    })),
    // Sold — closed deals
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => ({
      idx: 40 + i,
      pipeline: 'sold',
      contactType: 'SELLER',
      leadType: 'DIRECT_TO_SELLER',
      leadStatus: 'ACTIVE',
      propertyStatus: 'SOLD',
      activeLeadStage: null,
      exitStrategy: i % 2 === 0 ? 'WHOLESALE_ASSIGNMENT' : 'FIX_AND_FLIP',
      soldAt: new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000),
      soldPrice: 245000 + i * 22000,
      offerPrice: 230000 + i * 20000,
      leadCampaignId: dtsCampaign.id,
      campaignName: dtsCampaign.name,
    })),
    // Rental — held for rent
    ...Array.from({ length: 5 }, (_, i): PipelineConfig => ({
      idx: 45 + i,
      pipeline: 'rental',
      contactType: 'SELLER',
      leadType: 'DIRECT_TO_SELLER',
      leadStatus: 'ACTIVE',
      propertyStatus: 'RENTAL',
      activeLeadStage: null,
      exitStrategy: 'RENTAL',
      rentalAt: new Date(Date.now() - (i + 1) * 14 * 24 * 60 * 60 * 1000),
      leadCampaignId: dtsCampaign.id,
      campaignName: dtsCampaign.name,
    })),
  ]

  // ── Create leads ──────────────────────────────────────────────────────────
  const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '')
  let created = 0
  const perPipelineCount: Record<string, number> = {}

  for (const config of pipelines) {
    const [street, city, state, zip] = ADDRESSES[config.idx]
    const contact = CONTACTS[config.idx]
    const leadNumber = `HP-${yearMonth}-${String(created + 1).padStart(4, '0')}`

    await sequelize.transaction(async (tx) => {
      const property = await Property.create({
        streetAddress: street,
        city,
        state,
        zip,
        normalizedAddress: normalizeAddress(street, city, state, zip),
        leadType: config.leadType,
        leadStatus: config.leadStatus,
        propertyStatus: config.propertyStatus,
        activeLeadStage: config.activeLeadStage,
        tmStage: config.tmStage ?? null,
        inventoryStage: config.inventoryStage ?? null,
        exitStrategy: config.exitStrategy ?? null,
        inDispo: config.inDispo ?? false,
        soldAt: config.soldAt ?? null,
        soldPrice: config.soldPrice ?? null,
        offerPrice: config.offerPrice ?? null,
        askingPrice: config.askingPrice ?? null,
        arv: config.arv ?? null,
        repairEstimate: config.repairEstimate ?? null,
        underContractAt: config.underContractAt ?? null,
        underContractPrice: config.underContractPrice ?? null,
        contractPrice: config.contractPrice ?? null,
        rentalAt: config.rentalAt ?? null,
        deadAt: config.deadAt ?? null,
        warmAt: config.warmAt ?? null,
        referredAt: config.referredAt ?? null,
        leadCampaignId: config.leadCampaignId,
        campaignName: config.campaignName,
        marketId,
        createdById: admin.id,
        leadNumber,
      } as any, { transaction: tx })

      const newContact = await Contact.create({
        type: config.contactType,
        firstName: contact.first,
        lastName: contact.last,
        phone: contact.phone,
      } as any, { transaction: tx })

      await PropertyContact.create({
        propertyId: property.id,
        contactId: newContact.id,
        isPrimary: true,
      } as any, { transaction: tx })

      await StageHistory.create({
        propertyId: property.id,
        pipeline: config.pipeline,
        toStage:
          config.activeLeadStage ??
          config.tmStage ??
          config.inventoryStage ??
          config.propertyStatus,
        changedById: admin.id,
        changedByName: admin.name,
      } as any, { transaction: tx })

      await ActivityLog.create({
        propertyId: property.id,
        userId: admin.id,
        action: 'LEAD_CREATED',
        detail: { description: `Seeded ${config.pipeline} pipeline lead` },
      } as any, { transaction: tx })
    })

    created++
    perPipelineCount[config.pipeline] = (perPipelineCount[config.pipeline] ?? 0) + 1
    console.log(`  [${config.pipeline.padEnd(9)}] ${street}, ${city} — ${contact.first} ${contact.last}`)
  }

  console.log(`\n✓ Created ${created} leads`)
  for (const [pipeline, count] of Object.entries(perPipelineCount)) {
    console.log(`    ${pipeline.padEnd(10)} ${count}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
