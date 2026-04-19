import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth-utils'

const CreateTemplateSchema = z.object({
  templateType: z.enum(['sms', 'email', 'rvm', 'task', 'direct_mail']),
  name: z.string().min(1).max(128),
  category: z.string().max(64).nullable().optional(),
  subject: z.string().max(256).nullable().optional(),
  bodyContent: z.string().min(1),
  isActive: z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.view')
  if (deny) return deny

  const sp = req.nextUrl.searchParams
  const templateType = sp.get('type') ?? undefined
  const ALLOWED_TYPES = ['sms', 'email', 'rvm', 'task', 'direct_mail'] as const
  type TemplateType = typeof ALLOWED_TYPES[number]
  const tt = templateType && ALLOWED_TYPES.includes(templateType as TemplateType)
    ? (templateType as TemplateType)
    : undefined

  const templates = await prisma.template.findMany({
    where: tt ? { templateType: tt } : undefined,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: templates })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json()
  const parsed = CreateTemplateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const template = await prisma.template.create({
    data: parsed.data,
  })

  return NextResponse.json({ success: true, data: template }, { status: 201 })
}
