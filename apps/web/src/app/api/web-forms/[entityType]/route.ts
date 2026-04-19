import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const VALID_ENTITY_TYPES = ['leads', 'buyers', 'vendors']

const DEFAULT_FIELDS: Record<string, Array<{ fieldName: string; label: string; visible: boolean; required: boolean }>> = {
  leads: [
    { fieldName: 'firstName', label: 'First Name', visible: true, required: true },
    { fieldName: 'lastName', label: 'Last Name', visible: true, required: false },
    { fieldName: 'phone', label: 'Phone', visible: true, required: true },
    { fieldName: 'email', label: 'Email', visible: true, required: false },
    { fieldName: 'address', label: 'Property Address', visible: true, required: true },
    { fieldName: 'city', label: 'City', visible: true, required: false },
    { fieldName: 'state', label: 'State', visible: true, required: false },
    { fieldName: 'zip', label: 'ZIP Code', visible: true, required: false },
  ],
  buyers: [
    { fieldName: 'firstName', label: 'First Name', visible: true, required: true },
    { fieldName: 'lastName', label: 'Last Name', visible: true, required: false },
    { fieldName: 'phone', label: 'Phone', visible: true, required: true },
    { fieldName: 'email', label: 'Email', visible: true, required: true },
    { fieldName: 'preferredMarkets', label: 'Preferred Markets', visible: true, required: false },
    { fieldName: 'notes', label: 'Notes', visible: true, required: false },
  ],
  vendors: [
    { fieldName: 'firstName', label: 'First Name', visible: true, required: true },
    { fieldName: 'lastName', label: 'Last Name', visible: true, required: false },
    { fieldName: 'phone', label: 'Phone', visible: true, required: true },
    { fieldName: 'email', label: 'Email', visible: true, required: false },
    { fieldName: 'category', label: 'Service Category', visible: true, required: true },
    { fieldName: 'notes', label: 'Notes', visible: true, required: false },
  ],
}

type Params = { params: Promise<{ entityType: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityType } = await params
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
  }

  const config = await prisma.webFormConfig.findUnique({
    where: { entityType },
  })

  // Generate embed code
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const embedCode = `<iframe src="${baseUrl}/forms/${entityType}" width="100%" height="600" frameborder="0" style="border: none;"></iframe>`

  if (!config) {
    return NextResponse.json({
      data: {
        entityType,
        fields: DEFAULT_FIELDS[entityType] || [],
        embedCode,
      },
    })
  }

  return NextResponse.json({
    data: { ...config, embedCode },
  })
}

const UpdateSchema = z.object({
  fields: z.array(z.object({
    fieldName: z.string().min(1),
    label: z.string().min(1),
    visible: z.boolean().default(true),
    required: z.boolean().default(false),
  })),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityType } = await params
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  // Generate embed code
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const embedCode = `<iframe src="${baseUrl}/forms/${entityType}" width="100%" height="600" frameborder="0" style="border: none;"></iframe>`

  const config = await prisma.webFormConfig.upsert({
    where: { entityType },
    create: { entityType, fields: JSON.parse(JSON.stringify(parsed.data.fields)), embedCode },
    update: { fields: JSON.parse(JSON.stringify(parsed.data.fields)), embedCode },
  })

  return NextResponse.json({ success: true, data: config })
}
