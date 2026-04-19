import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function upsertMarket(client: pg.PoolClient, name: string, state: string) {
  await client.query(
    `INSERT INTO "Market" (id, name, state, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
     ON CONFLICT (name) DO NOTHING`,
    [name, state]
  )
}

async function upsertRole(
  client: pg.PoolClient,
  name: string,
  description: string,
  permissions: string[],
  isSystem: boolean
): Promise<string> {
  const result = await client.query(
    `INSERT INTO "Role" (id, name, description, permissions, "isSystem", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, description, permissions, isSystem]
  )
  return result.rows[0].id as string
}

async function upsertUser(
  client: pg.PoolClient,
  email: string,
  passwordHash: string,
  name: string,
  status: string,
  roleId: string
) {
  await client.query(
    `INSERT INTO "User" (id, email, "passwordHash", name, status, "roleId", "marketIds", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, '{}', NOW(), NOW())
     ON CONFLICT (email) DO NOTHING`,
    [email, passwordHash, name, status, roleId]
  )
}

async function main() {
  console.log('🌱 Seeding database...')

  const client = await pool.connect()
  try {
    // ── Markets ──────────────────────────────────────────────────────────────
    const markets = ['DFW', 'Houston', 'Austin', 'San Antonio']
    for (const name of markets) {
      await upsertMarket(client, name, 'TX')
    }
    console.log('  ✓ Markets seeded (DFW, Houston, Austin, San Antonio)')

    // ── Roles (22 total — labels only, permissions live on User.permissions[]) ──
    //
    // Roles are decoupled from permissions. Permissions are assigned per-user via
    // the Manage Users panel. Each role here is just a label/name used to group
    // users in the Lead Campaigns role-toggles UI and in the Role Assignment window.

    const ROLE_NAMES = [
      'Accountant',
      'Acquisition Manager',
      'Acquisition Sales Manager',
      'Admin',
      'Bookkeeper',
      'Closing Coordinator',
      'Co-Owner',
      'Cold Caller',
      'Disposition Manager',
      'Lead Manager',
      'Marketing Assistant',
      'Marketing Manager',
      'Office Manager',
      'Other Role',
      'Owner',
      'Project Manager',
      'Property Analyst',
      'Property Manager',
      'Real Estate Agent',
      'Social Media Manager',
      'TC Assistant',
      'Transaction Coordinator',
    ]

    let adminRoleId = ''
    for (const name of ROLE_NAMES) {
      const id = await upsertRole(client, name, name, [], true)
      if (name === 'Admin') adminRoleId = id
    }

    // The seeded admin user gets the 'Admin' label so the Users panel shows it nicely.
    // All actual permissions are granted directly on User.permissions[] at user creation.

    console.log(`  ✓ Roles seeded (${ROLE_NAMES.length} roles: ${ROLE_NAMES.join(', ')})`)

    // ── Admin User ────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('Admin1234!', 12)
    await upsertUser(
      client,
      'admin@homewardpartners.com',
      passwordHash,
      'Admin',
      'ACTIVE',
      adminRoleId
    )

    console.log('  ✓ Admin user created: admin@homewardpartners.com / Admin1234!')
    console.log('  ⚠  CHANGE THE ADMIN PASSWORD AFTER FIRST LOGIN!')
    console.log('')
    console.log('✅ Seeding complete.')
  } finally {
    client.release()
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => pool.end())
