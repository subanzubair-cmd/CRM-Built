import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { sequelize } from '@crm/database'

/**
 * GET  /api/contact-types             — returns string[]
 * POST /api/contact-types  { name }   — add a contact type
 * DELETE /api/contact-types?name=...  — remove
 *
 * Stored as a JSONB array on the CompanySettings singleton row.
 * The column is self-healing — created via ALTER TABLE IF NOT EXISTS.
 */

const DEFAULT_CONTACT_TYPES = [
  'Brother',
  'Sister',
  'Father',
  'Mother',
  'Son',
  'Daughter',
  'Spouse',
  'Friend',
  'Business Partner',
  'Attorney',
  'Accountant',
  'Contractor',
  'Property Manager',
  'Tenant',
  'Neighbor',
  'Other',
]

/** Ensure the JSONB column exists on CompanySettings. */
async function ensureColumn() {
  await sequelize.query(`
    ALTER TABLE "CompanySettings"
      ADD COLUMN IF NOT EXISTS "contactTypes" JSONB DEFAULT '[]'::jsonb;
  `)
}

/** Read contact types from the singleton row. Seeds defaults if empty. */
async function readTypes(): Promise<string[]> {
  await ensureColumn()
  const [rows]: any = await sequelize.query(
    `SELECT "contactTypes" FROM "CompanySettings" WHERE id = 'singleton'`,
  )
  const raw = rows?.[0]?.contactTypes
  if (Array.isArray(raw) && raw.length > 0) return raw
  // Seed defaults on first access.
  await sequelize.query(
    `UPDATE "CompanySettings" SET "contactTypes" = :val WHERE id = 'singleton'`,
    { replacements: { val: JSON.stringify(DEFAULT_CONTACT_TYPES) } },
  )
  return DEFAULT_CONTACT_TYPES
}

async function writeTypes(types: string[]) {
  await ensureColumn()
  await sequelize.query(
    `UPDATE "CompanySettings" SET "contactTypes" = :val WHERE id = 'singleton'`,
    { replacements: { val: JSON.stringify(types) } },
  )
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const types = await readTypes()
  return NextResponse.json({ data: types })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = (body.name as string)?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 })
  }
  const types = await readTypes()
  if (types.some((t) => t.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: 'Contact type already exists' }, { status: 409 })
  }
  const updated = [...types, name].sort((a, b) => a.localeCompare(b))
  await writeTypes(updated)
  return NextResponse.json({ data: updated }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name')
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 })
  }
  const types = await readTypes()
  const updated = types.filter((t) => t !== name)
  await writeTypes(updated)
  return NextResponse.json({ data: updated })
}
