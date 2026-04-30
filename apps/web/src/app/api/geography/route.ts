import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { sequelize } from '@crm/database'

/**
 * GET /api/geography?kind=city|zip|county|state[&q=...]
 *
 * Returns the distinct list of values across all Buyer rows for the
 * requested geography kind. Powers the searchable multi-select on
 * the Buyer form's Target Cities / Zips / Counties / States fields:
 * once a value has been entered for any buyer, future buyer forms
 * can pick it from the dropdown rather than re-typing.
 *
 * Hard-capped at 500 rows so a runaway query doesn't return tens of
 * thousands of zips. The form does its own client-side filter on top.
 */

const COLUMN: Record<string, string> = {
  city: 'targetCities',
  zip: 'targetZips',
  county: 'targetCounties',
  state: 'targetStates',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sp = req.nextUrl.searchParams
  const kind = sp.get('kind') ?? 'city'
  const q = (sp.get('q') ?? '').trim()
  const col = COLUMN[kind]
  if (!col) {
    return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 })
  }

  // unnest() flattens the TEXT[] column then DISTINCT collapses to
  // the unique value set. ILIKE filter when q is present.
  const where = q.length > 0 ? `WHERE v ILIKE :q` : ''
  const sql = `
    SELECT DISTINCT v
      FROM (
        SELECT unnest("${col}") AS v
          FROM "Buyer"
      ) t
      ${where}
      ORDER BY v ASC
      LIMIT 500
  `
  const rows = (await sequelize.query(sql, {
    replacements: { q: `%${q}%` },
    plain: false,
  })) as any[]
  const flat = (rows[0] ?? []).map((r: any) => r.v as string).filter(Boolean)
  return NextResponse.json({ values: flat })
}
