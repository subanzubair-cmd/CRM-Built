import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AdditionalContact } from '@crm/database'
import { z } from 'zod'
import { normalizePhone } from '@/lib/phone'

/**
 * GET  /api/additional-contacts?subjectType=BUYER|VENDOR&subjectId=...
 * POST /api/additional-contacts  { subjectType, subjectId, relationship, firstName, lastName?, phone?, email?, notes? }
 */

const CreateSchema = z.object({
  subjectType: z.enum(['BUYER', 'VENDOR']),
  subjectId: z.string().min(1),
  relationship: z.string().min(1).max(100),
  firstName: z.string().min(1).max(200),
  lastName: z.string().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subjectType = req.nextUrl.searchParams.get('subjectType')
  const subjectId = req.nextUrl.searchParams.get('subjectId')
  if (!subjectType || !subjectId) {
    return NextResponse.json({ error: 'subjectType and subjectId are required' }, { status: 422 })
  }

  const contacts = await AdditionalContact.findAll({
    where: { subjectType, subjectId },
    order: [['createdAt', 'ASC']],
  })

  return NextResponse.json({ data: contacts })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(', ') },
      { status: 422 },
    )
  }

  const contact = await AdditionalContact.create({
    subjectType: parsed.data.subjectType,
    subjectId: parsed.data.subjectId,
    relationship: parsed.data.relationship,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName ?? null,
    phone: normalizePhone(parsed.data.phone) ?? null,
    email: parsed.data.email ?? null,
    notes: parsed.data.notes ?? null,
  })

  return NextResponse.json({ data: contact }, { status: 201 })
}
