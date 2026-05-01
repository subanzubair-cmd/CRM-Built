import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { sequelize } from '@crm/database'

/**
 * GET  /api/contact-sources?type=buyer|vendor  — returns string[]
 * POST /api/contact-sources  { type, name }    — add a source
 * DELETE /api/contact-sources?type=buyer|vendor&name=...  — remove
 *
 * Stored as JSONB arrays on the CompanySettings singleton row.
 * Columns are self-healing — created via ALTER TABLE IF NOT EXISTS
 * on first access.
 */

const DEFAULT_BUYER_SOURCES = [
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
  'Referral',
  'Other',
]

const DEFAULT_VENDOR_SOURCES = [
  'Referral',
  'Google Search',
  'Social Media',
  'Cold Call',
  'Trade Show',
  'Existing Relationship',
  'Other',
]

const COLUMN_MAP: Record<string, string> = {
  buyer: 'buyerSources',
  vendor: 'vendorSources',
}

const DEFAULTS: Record<string, string[]> = {
  buyer: DEFAULT_BUYER_SOURCES,
  vendor: DEFAULT_VENDOR_SOURCES,
}

/** Ensure JSONB columns exist on CompanySettings. */
async function ensureColumns() {
  await sequelize.query(`
    ALTER TABLE "CompanySettings"
      ADD COLUMN IF NOT EXISTS "buyerSources" JSONB DEFAULT '[]'::jsonb;
  `)
  await sequelize.query(`
    ALTER TABLE "CompanySettings"
      ADD COLUMN IF NOT EXISTS "vendorSources" JSONB DEFAULT '[]'::jsonb;
  `)
}

/** Read sources from the singleton row. Seeds defaults if empty. */
async function readSources(type: string): Promise<string[]> {
  await ensureColumns()
  const col = COLUMN_MAP[type]
  const [rows]: any = await sequelize.query(
    `SELECT "${col}" FROM "CompanySettings" WHERE id = 'singleton'`,
  )
  const raw = rows?.[0]?.[col]
  if (Array.isArray(raw) && raw.length > 0) return raw
  // Seed defaults on first access.
  const defaults = DEFAULTS[type]
  await sequelize.query(
    `UPDATE "CompanySettings" SET "${col}" = :val WHERE id = 'singleton'`,
    { replacements: { val: JSON.stringify(defaults) } },
  )
  return defaults
}

async function writeSources(type: string, sources: string[]) {
  await ensureColumns()
  const col = COLUMN_MAP[type]
  await sequelize.query(
    `UPDATE "CompanySettings" SET "${col}" = :val WHERE id = 'singleton'`,
    { replacements: { val: JSON.stringify(sources) } },
  )
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type')
  if (!type || !COLUMN_MAP[type]) {
    return NextResponse.json({ error: 'type must be "buyer" or "vendor"' }, { status: 422 })
  }
  const sources = await readSources(type)
  return NextResponse.json({ data: sources })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const type = body.type as string
  const name = (body.name as string)?.trim()
  if (!type || !COLUMN_MAP[type]) {
    return NextResponse.json({ error: 'type must be "buyer" or "vendor"' }, { status: 422 })
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 })
  }
  const sources = await readSources(type)
  if (sources.some((s) => s.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: 'Source already exists' }, { status: 409 })
  }
  const updated = [...sources, name].sort((a, b) => a.localeCompare(b))
  await writeSources(type, updated)
  return NextResponse.json({ data: updated }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type')
  const name = req.nextUrl.searchParams.get('name')
  if (!type || !COLUMN_MAP[type]) {
    return NextResponse.json({ error: 'type must be "buyer" or "vendor"' }, { status: 422 })
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 })
  }
  const sources = await readSources(type)
  const updated = sources.filter((s) => s !== name)
  await writeSources(type, updated)
  return NextResponse.json({ data: updated })
}
