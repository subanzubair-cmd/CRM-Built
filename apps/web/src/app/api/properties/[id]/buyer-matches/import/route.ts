import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { Buyer, BuyerMatch, Contact, PipelineStageConfig, sequelize } from '@crm/database'
import { z } from 'zod'
import { normalizePhone } from '@/lib/phone'
import { findDuplicateContact } from '@/lib/dedupe'

const RowSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
})

const ImportSchema = z.object({
  dispoStage: z.string().min(1).max(100),
  rows: z.array(RowSchema).min(1).max(500),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.edit')
  if (deny) return deny

  const { id: propertyId } = await params
  const body = await req.json()
  const parsed = ImportSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { dispoStage, rows } = parsed.data

  // Pre-fetch dispo stage labels so we can include them in the skipped report
  const stageConfigs = await PipelineStageConfig.findAll({
    where: { pipeline: 'dispo', isActive: true },
    raw: true,
  })
  const stageLabelMap: Record<string, string> = {}
  for (const sc of stageConfigs) {
    stageLabelMap[(sc as any).stageCode] = (sc as any).label
  }

  let created = 0
  let merged = 0
  let skipped = 0
  const errors: string[] = []
  const skippedDetails: Array<{ name: string; stage: string }> = []

  for (const row of rows) {
    try {
      const normalizedPhone = row.phone ? (normalizePhone(row.phone) ?? row.phone) : undefined

      // Find or create the buyer
      let buyerId: string | null = null

      const dup = await findDuplicateContact({
        allPhones: normalizedPhone ? [normalizedPhone] : [],
        allEmails: row.email ? [row.email] : [],
        contactType: 'BUYER',
      })

      if (dup?.buyerId) {
        buyerId = dup.buyerId
      } else {
        // Create new contact + buyer
        const newBuyer = await sequelize.transaction(async (t) => {
          const contact = await Contact.create(
            {
              type: 'BUYER',
              firstName: row.firstName,
              lastName: row.lastName ?? null,
              phone: normalizedPhone ?? null,
              email: row.email ?? null,
              phones: normalizedPhone ? [{ label: 'Mobile', number: normalizedPhone }] : [],
              emails: row.email ? [{ label: 'Primary', email: row.email }] : [],
            },
            { transaction: t },
          )
          return Buyer.create(
            {
              contactId: contact.id,
              notes: row.notes ?? null,
            } as any,
            { transaction: t },
          )
        })
        buyerId = (newBuyer as any).id
      }

      if (!buyerId) {
        errors.push(`${row.firstName}: could not resolve buyer`)
        continue
      }

      // Find or create the BuyerMatch
      const existing = await BuyerMatch.findOne({ where: { propertyId, buyerId } as any, raw: true })
      if (existing) {
        skipped++
        const existingStage = (existing as any).dispoStage ?? ''
        const stageLabel = stageLabelMap[existingStage] ?? existingStage ?? 'Unknown Stage'
        const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ')
        skippedDetails.push({ name: fullName, stage: stageLabel })
      } else {
        await BuyerMatch.create({ propertyId, buyerId, dispoStage, score: 0 } as any)
        if (dup?.buyerId) {
          merged++
        } else {
          created++
        }
      }
    } catch (err: any) {
      errors.push(`${row.firstName}: ${err?.message ?? 'unknown error'}`)
    }
  }

  return NextResponse.json({ success: true, created, merged, skipped, skippedDetails, errors }, { status: 200 })
}
