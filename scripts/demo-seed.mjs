/**
 * demo-seed.mjs
 * Inserts rich demo data into the Homeward Partners CRM database.
 * Run: node scripts/demo-seed.mjs   (from project root)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Resolve dotenv + pg from the database package's node_modules (pnpm isolates them)
const dbModules = path.resolve(__dirname, '../packages/database/node_modules');
const dotenv = require(path.join(dbModules, 'dotenv'));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = require(path.join(dbModules, 'pg'));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    // ── 1. Look up market + admin user ──────────────────────────────────────
    const marketRes = await client.query(
      `SELECT id FROM "Market" WHERE name = 'DFW' LIMIT 1`
    );
    if (marketRes.rows.length === 0) throw new Error('DFW market not found — run the main seed first');
    const marketId = marketRes.rows[0].id;

    const userRes = await client.query(
      `SELECT id FROM "User" WHERE email = 'admin@homewardpartners.com' LIMIT 1`
    );
    if (userRes.rows.length === 0) throw new Error('Admin user not found — run the main seed first');
    const adminId = userRes.rows[0].id;

    console.log(`Using market: ${marketId}`);
    console.log(`Using admin:  ${adminId}`);

    // ── 2. Properties ────────────────────────────────────────────────────────
    const propInsert = async ({
      streetAddress, city, state, zip, bedrooms, bathrooms, arv,
      leadType, leadStatus, propertyStatus, tmStage = null, activeLeadStage = null,
    }) => {
      const res = await client.query(
        `INSERT INTO "Property"
           (id, "streetAddress", city, state, zip, bedrooms, bathrooms, arv,
            "leadType", "leadStatus", "propertyStatus", "tmStage", "activeLeadStage",
            "marketId", "createdById", source, "createdAt", "updatedAt", "lastActivityAt")
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
            $8::"LeadType", $9::"LeadStatus", $10::"PropertyStatus",
            $11::"TmStage", $12::"ActiveLeadStage",
            $13, $14, 'Demo Seed', NOW(), NOW(), NOW())
         RETURNING id, "streetAddress"`,
        [
          streetAddress, city, state, zip, bedrooms, bathrooms, arv,
          leadType, leadStatus, propertyStatus,
          tmStage, activeLeadStage,
          marketId, adminId,
        ]
      );
      return res.rows[0];
    };

    // DTS Hot leads
    const p1 = await propInsert({ streetAddress: '123 Oak Street', city: 'Dallas', state: 'TX', zip: '75201', bedrooms: 3, bathrooms: 2.0, arv: 285000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'ACTIVE', propertyStatus: 'LEAD', activeLeadStage: 'DISCOVERY' });
    const p2 = await propInsert({ streetAddress: '456 Elm Ave', city: 'Fort Worth', state: 'TX', zip: '76101', bedrooms: 4, bathrooms: 3.0, arv: 340000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'ACTIVE', propertyStatus: 'LEAD', activeLeadStage: 'OFFER_MADE' });
    const p3 = await propInsert({ streetAddress: '789 Maple Dr', city: 'Arlington', state: 'TX', zip: '76001', bedrooms: 3, bathrooms: 2.0, arv: 225000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'ACTIVE', propertyStatus: 'LEAD', activeLeadStage: 'APPOINTMENT_MADE' });

    // DTA lead
    const p4 = await propInsert({ streetAddress: '321 Pine Rd', city: 'Plano', state: 'TX', zip: '75023', bedrooms: 4, bathrooms: 3.0, arv: 420000, leadType: 'DIRECT_TO_AGENT', leadStatus: 'WARM', propertyStatus: 'LEAD', activeLeadStage: 'NEW_LEAD' });

    // Warm DTS lead
    const p5 = await propInsert({ streetAddress: '654 Cedar Blvd', city: 'Irving', state: 'TX', zip: '75061', bedrooms: 3, bathrooms: 2.0, arv: 198000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'WARM', propertyStatus: 'LEAD', activeLeadStage: 'INTERESTED_ADD_TO_FOLLOW_UP' });

    // Dead lead
    const p6 = await propInsert({ streetAddress: '987 Birch Ln', city: 'Garland', state: 'TX', zip: '75040', bedrooms: 2, bathrooms: 1.0, arv: 165000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'DEAD', propertyStatus: 'LEAD' });

    // TM property
    const p7 = await propInsert({ streetAddress: '111 Commerce St', city: 'Dallas', state: 'TX', zip: '75202', bedrooms: 3, bathrooms: 2.0, arv: 315000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'ACTIVE', propertyStatus: 'IN_TM', tmStage: 'CLEAR_TO_CLOSE' });

    // Inventory property
    const p8 = await propInsert({ streetAddress: '222 Market Blvd', city: 'Dallas', state: 'TX', zip: '75208', bedrooms: 4, bathrooms: 3.0, arv: 395000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'ACTIVE', propertyStatus: 'IN_INVENTORY' });

    // Dispo property
    const p9 = await propInsert({ streetAddress: '333 Trade Ave', city: 'Dallas', state: 'TX', zip: '75219', bedrooms: 3, bathrooms: 2.0, arv: 265000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'ACTIVE', propertyStatus: 'IN_DISPO' });
    await client.query(
      `UPDATE "Property" SET "inDispo" = true WHERE id = $1`,
      [p9.id]
    );

    // Sold property — insert without soldAt, then update with SQL expression
    const p10 = await propInsert({ streetAddress: '444 Exchange Dr', city: 'Dallas', state: 'TX', zip: '75234', bedrooms: 4, bathrooms: 3.0, arv: 378000, leadType: 'DIRECT_TO_SELLER', leadStatus: 'ACTIVE', propertyStatus: 'SOLD' });
    await client.query(
      `UPDATE "Property" SET "soldAt" = NOW() - INTERVAL '30 days' WHERE id = $1`,
      [p10.id]
    );

    const properties = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10];
    console.log(`\nCreated ${properties.length} properties:`);
    properties.forEach(p => console.log(`  - ${p.streetAddress}`));

    // ── 3. Contacts ──────────────────────────────────────────────────────────
    const contactData = [
      { firstName: 'James',    lastName: 'Harper',    phone: '214-555-0101', email: 'james.harper@email.com',   propId: p1.id },
      { firstName: 'Patricia', lastName: 'Wells',     phone: '214-555-0102', email: null,                       propId: p2.id },
      { firstName: 'Michael',  lastName: 'Torres',    phone: '214-555-0103', email: 'mtorres@gmail.com',         propId: p3.id },
      { firstName: 'Sandra',   lastName: 'Brooks',    phone: '214-555-0104', email: 'sandrabrooks@yahoo.com',    propId: p4.id },
      { firstName: 'Robert',   lastName: 'Nguyen',    phone: '214-555-0105', email: null,                       propId: p5.id },
      { firstName: 'Linda',    lastName: 'Martinez',  phone: '214-555-0106', email: null,                       propId: p6.id },
      { firstName: 'David',    lastName: 'Johnson',   phone: '214-555-0107', email: 'djohnson@hotmail.com',      propId: p7.id },
      { firstName: 'Karen',    lastName: 'White',     phone: '214-555-0108', email: null,                       propId: p8.id },
      { firstName: 'Charles',  lastName: 'Davis',     phone: '214-555-0109', email: 'cdavis@email.com',          propId: p9.id },
      { firstName: 'Barbara',  lastName: 'Wilson',    phone: '214-555-0110', email: null,                       propId: p10.id },
    ];

    let contactCount = 0;
    for (const c of contactData) {
      const cRes = await client.query(
        `INSERT INTO "Contact" (id, type, "firstName", "lastName", phone, email, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), 'SELLER'::"ContactType", $1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
        [c.firstName, c.lastName, c.phone, c.email]
      );
      const contactId = cRes.rows[0].id;

      await client.query(
        `INSERT INTO "PropertyContact" (id, "propertyId", "contactId", role, "isPrimary", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, 'Seller', true, NOW())
         ON CONFLICT ("propertyId", "contactId") DO NOTHING`,
        [c.propId, contactId]
      );
      contactCount++;
    }
    console.log(`\nCreated ${contactCount} contacts (1 per property)`);

    // ── 4. Notes ─────────────────────────────────────────────────────────────
    const noteData = [
      { propId: p1.id, body: 'Called owner, interested in cash offer. Wants to close within 60 days. Property has some foundation issues but owner motivated.' },
      { propId: p1.id, body: 'Follow-up call — confirmed they have no agent. ARV confirmed at $285k by comps. Scheduling walkthrough next week.' },
      { propId: p2.id, body: 'Seller inherited the property. Behind on taxes ~$4,200. Very motivated to close quickly, no repair budget.' },
      { propId: p3.id, body: 'Appointment scheduled for Saturday 10am. Owner mentioned roof needs work. Estimated $8k repair.' },
      { propId: p4.id, body: 'Agent referral — listing expired after 90 days. Owner considering cash offer as backup plan.' },
      { propId: p5.id, body: 'Left voicemail x2. Sent follow-up text. Owner responded: "Not ready yet but keep me in mind." Added to drip campaign.' },
      { propId: p7.id, body: 'Title work ordered. Clean title confirmed. Closing set for 2 weeks out.' },
      { propId: p8.id, body: 'Rehab complete. Listed for sale. Two showings scheduled this week.' },
      { propId: p9.id, body: 'Property listed on buyers list. 3 interested buyers. Best offer so far: $258k.' },
    ];

    let noteCount = 0;
    for (const n of noteData) {
      await client.query(
        `INSERT INTO "Note" (id, "propertyId", body, "authorId", "authorName", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'Admin', NOW(), NOW())`,
        [n.propId, n.body, adminId]
      );
      noteCount++;
    }
    console.log(`Created ${noteCount} notes`);

    // ── 5. Tasks ─────────────────────────────────────────────────────────────
    const taskData = [
      { propId: p1.id, title: 'Follow up call — confirm walkthrough date',  type: 'CALL',      priority: 2 },
      { propId: p2.id, title: 'Send offer letter to seller',                 type: 'OFFER',     priority: 2 },
      { propId: p3.id, title: 'Schedule property walkthrough',               type: 'APPOINTMENT', priority: 2 },
      { propId: p4.id, title: 'Follow up with referring agent',              type: 'FOLLOW_UP', priority: 1 },
      { propId: p5.id, title: 'Send warm sequence SMS',                      type: 'FOLLOW_UP', priority: 1 },
      { propId: p7.id, title: 'Confirm title work completion',               type: 'FOLLOW_UP', priority: 2 },
      { propId: p8.id, title: 'Review showing feedback and adjust price',    type: 'OTHER',     priority: 1 },
      { propId: p9.id, title: 'Call top buyer prospect about dispo property', type: 'CALL',     priority: 2 },
    ];

    let taskCount = 0;
    for (const t of taskData) {
      await client.query(
        `INSERT INTO "Task"
           (id, "propertyId", title, type, status, priority, "dueAt",
            "assignedToId", "createdById", "createdAt", "updatedAt")
         VALUES
           (gen_random_uuid(), $1, $2, $3::"TaskType", 'PENDING'::"TaskStatus",
            $4, NOW() + INTERVAL '3 days', $5, $6, NOW(), NOW())`,
        [t.propId, t.title, t.type, t.priority, adminId, adminId]
      );
      taskCount++;
    }
    console.log(`Created ${taskCount} tasks`);

    // ── 6. Campaign + Steps ──────────────────────────────────────────────────
    const campRes = await client.query(
      `INSERT INTO "Campaign"
         (id, name, type, description, status, "marketId", "aiEnabled", "createdAt", "updatedAt")
       VALUES
         (gen_random_uuid(), 'DTS Follow-Up Sequence',
          'DRIP'::"CampaignType",
          'Automated follow-up for direct to seller leads',
          'ACTIVE'::"CampaignStatus",
          $1, false, NOW(), NOW())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [marketId]
    );

    let campaignId = null;
    if (campRes.rows.length > 0) {
      campaignId = campRes.rows[0].id;

      const steps = [
        {
          order: 0, delayDays: 0, channel: 'SMS',
          body: 'Hi {firstName}, this is Sarah from Homeward Partners. I saw your property at {address} and wanted to reach out about a cash offer.',
        },
        {
          order: 1, delayDays: 3, channel: 'SMS',
          body: 'Hi {firstName}, just following up on my message from a few days ago about {address}. Would love to chat if you have a moment!',
        },
        {
          order: 2, delayDays: 7, channel: 'SMS',
          body: "Last follow-up — if you ever consider selling {address}, we make fast cash offers with no repairs needed. Have a great day!",
        },
      ];

      for (const s of steps) {
        await client.query(
          `INSERT INTO "CampaignStep"
             (id, "campaignId", "order", "delayDays", channel, body, "isActive", "createdAt", "updatedAt")
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4::"MessageChannel", $5, true, NOW(), NOW())`,
          [campaignId, s.order, s.delayDays, s.channel, s.body]
        );
      }
      console.log(`Created campaign "${campaignId ? 'DTS Follow-Up Sequence' : ''}" with 3 steps`);
    } else {
      console.log('Campaign already existed — skipped');
    }

    // ── 7. Twilio Number ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO "TwilioNumber"
         (id, number, "friendlyName", "marketId", "isActive", "createdAt")
       VALUES
         (gen_random_uuid(), '+12145550001', 'DFW Main Line', $1, true, NOW())
       ON CONFLICT (number) DO NOTHING`,
      [marketId]
    );
    console.log('Created TwilioNumber: +12145550001');

    // ── 8. Summary ───────────────────────────────────────────────────────────
    console.log('\n━━━ Demo Seed Complete ━━━');
    console.log(`  Properties : ${properties.length}`);
    console.log(`  Contacts   : ${contactCount}`);
    console.log(`  Notes      : ${noteCount}`);
    console.log(`  Tasks      : ${taskCount}`);
    console.log(`  Campaigns  : 1 (3 steps)`);
    console.log(`  Twilio #s  : 1`);
    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
