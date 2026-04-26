import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  ListStackSource,
  Property,
  Contact,
  PropertyContact,
  sequelize,
  fn,
  col,
  literal,
} from '@crm/database'
import { getListSources } from '@/lib/list-stacking'
import { requirePermission } from '@/lib/auth-utils'

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.replace(/['"]/g, '').trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.replace(/['"]/g, '').trim())
    return Object.fromEntries(header.map((h, i) => [h, values[i] ?? '']))
  })
}

function findCol(row: Record<string, string>, keywords: string[]): string {
  for (const k of keywords) {
    const found = Object.keys(row).find((key) => key.includes(k))
    if (found) return row[found] ?? ''
  }
  return ''
}

export async function GET() {
  const session = await auth()
  const deny = requirePermission(session, 'leads.view')
  if (deny) return deny
  const sources = await getListSources()
  return NextResponse.json(sources)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.create')
  if (deny) return deny

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string | null)?.trim()
  const marketId = (formData.get('marketId') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || undefined

  if (!file || !name) {
    return NextResponse.json({ error: 'file and name are required' }, { status: 400 })
  }

  const text = await file.text()
  const rows = parseCSV(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })
  }

  const source = await ListStackSource.create({
    name,
    description: description ?? null,
    totalImported: 0,
  } as any)

  const listTag = `list:${source.id}`
  const createdById = ((session as any)?.user?.id ?? '') as string
  let created = 0
  let duped = 0

  for (const row of rows) {
    const streetAddress = findCol(row, ['address', 'street']) || null
    const city = findCol(row, ['city']) || null
    const state = findCol(row, ['state']) || null
    const zip = findCol(row, ['zip', 'postal']) || null
    const firstName = findCol(row, ['first', 'fname']) || 'Unknown'
    const lastName = findCol(row, ['last', 'lname']) || null
    const phone = findCol(row, ['phone', 'mobile', 'cell']) || null
    const email = findCol(row, ['email']) || null

    const normalizedAddress = streetAddress && city && state
      ? `${streetAddress.toLowerCase()}, ${city.toLowerCase()}, ${state.toLowerCase()} ${zip ?? ''}`.trim()
      : null

    if (normalizedAddress) {
      const existing = await Property.findOne({
        where: { normalizedAddress },
        attributes: ['id', 'tags'],
        raw: true,
      }) as any
      if (existing) {
        if (!(existing.tags ?? []).includes(listTag)) {
          await Property.update(
            { tags: fn('array_append', col('tags'), listTag) as any },
            { where: { id: existing.id } },
          )
        }
        duped++
        continue
      }
    }

    try {
      await sequelize.transaction(async (tx) => {
        const property = await Property.create({
          streetAddress,
          city,
          state,
          zip,
          normalizedAddress,
          leadType: 'DIRECT_TO_SELLER',
          leadStatus: 'ACTIVE',
          propertyStatus: 'LEAD',
          activeLeadStage: 'NEW_LEAD',
          marketId: marketId || undefined,
          createdById,
          tags: [listTag],
        } as any, { transaction: tx })

        const contact = await Contact.create({
          type: 'SELLER',
          firstName,
          lastName,
          phone: phone || null,
          email: email || null,
        } as any, { transaction: tx })

        await PropertyContact.create({
          propertyId: property.id,
          contactId: contact.id,
          isPrimary: true,
        } as any, { transaction: tx })
      })
      created++
    } catch {
      // skip on constraint violation
    }
  }

  const total = created + duped
  await source.update({ totalImported: total })

  return NextResponse.json({ id: source.id, name, total, created, duped }, { status: 201 })
}
