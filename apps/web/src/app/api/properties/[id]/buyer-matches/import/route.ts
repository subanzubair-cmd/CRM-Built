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
  tags: z.array(z.string()).optional(),
  source: z.string().max(200).optional(),
  howHeardAbout: z.string().max(200).optional(),
  mailingAddress: z.string().max(500).optional(),
  targetCities: z.array(z.string()).optional(),
  targetZips: z.array(z.string()).optional(),
  targetCounties: z.array(z.string()).optional(),
  targetStates: z.array(z.string()).optional(),
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
  let updated = 0
  const errors: string[] = []
  const skippedDetails: Array<{ name: string; stage: string }> = []

  for (const row of rows) {
    try {
      const normalizedPhone = row.phone ? (normalizePhone(row.phone) ?? row.phone) : undefined
      // source → howHeardAbout fallback (same as buyer directory import)
      const resolvedHowHeardAbout = row.howHeardAbout || row.source || undefined

      // Find or create the buyer
      let buyerId: string | null = null
      let contactId: string | null = null

      const dup = await findDuplicateContact({
        allPhones: normalizedPhone ? [normalizedPhone] : [],
        allEmails: row.email ? [row.email] : [],
        contactType: 'BUYER',
      })

      if (dup?.contact?.id) {
        contactId = dup.contact.id
        buyerId = dup.buyerId ?? null

        // ── Enrich existing contact with any NEW information ──
        // Only fill blank fields — never overwrite data the contact already has.
        const existingContact = await Contact.findByPk(dup.contact.id, { raw: true }) as any
        if (existingContact) {
          const contactUpdates: Record<string, unknown> = {}

          if (!existingContact.phone && normalizedPhone) {
            contactUpdates.phone = normalizedPhone
          }
          if (!existingContact.email && row.email) {
            contactUpdates.email = row.email
          }
          if (!existingContact.lastName && row.lastName) {
            contactUpdates.lastName = row.lastName
          }
          if (!existingContact.mailingAddress && row.mailingAddress) {
            contactUpdates.mailingAddress = row.mailingAddress
          }
          if (!existingContact.howHeardAbout && resolvedHowHeardAbout) {
            contactUpdates.howHeardAbout = resolvedHowHeardAbout
          }
          // Merge tags (add new ones, don't remove existing)
          if (row.tags && row.tags.length > 0) {
            const existingTags: string[] = existingContact.tags ?? []
            const merged = Array.from(new Set([...existingTags, ...row.tags]))
            if (merged.length > existingTags.length) {
              contactUpdates.tags = merged
            }
          }
          // Sync phones JSONB if we filled the scalar phone
          if (contactUpdates.phone) {
            const existingPhones: Array<{ label: string; number: string }> = existingContact.phones ?? []
            const alreadyInArr = existingPhones.some((p: any) =>
              p.number?.replace(/\D/g, '').endsWith((normalizedPhone as string).replace(/\D/g, '').slice(-10))
            )
            if (!alreadyInArr) {
              contactUpdates.phones = [...existingPhones, { label: 'Mobile', number: normalizedPhone as string }]
            }
          }

          if (Object.keys(contactUpdates).length > 0) {
            await Contact.update(contactUpdates as any, { where: { id: dup.contact.id } })
            updated++
          }
        }

        // Enrich buyer with target arrays if they're empty
        if (buyerId) {
          const existingBuyer = await Buyer.findByPk(buyerId, { raw: true }) as any
          if (existingBuyer) {
            const buyerUpdates: Record<string, unknown> = {}
            if ((!existingBuyer.targetCities?.length) && row.targetCities?.length) buyerUpdates.targetCities = row.targetCities
            if ((!existingBuyer.targetZips?.length) && row.targetZips?.length) buyerUpdates.targetZips = row.targetZips
            if ((!existingBuyer.targetCounties?.length) && row.targetCounties?.length) buyerUpdates.targetCounties = row.targetCounties
            if ((!existingBuyer.targetStates?.length) && row.targetStates?.length) buyerUpdates.targetStates = row.targetStates
            if (!existingBuyer.notes && row.notes) buyerUpdates.notes = row.notes
            if (Object.keys(buyerUpdates).length > 0) {
              await Buyer.update(buyerUpdates as any, { where: { id: buyerId } })
            }
          }
        }

        if (!buyerId) {
          errors.push(`${row.firstName}: found contact but no buyer profile`)
          continue
        }
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
              tags: row.tags ?? [],
              mailingAddress: row.mailingAddress ?? null,
              howHeardAbout: resolvedHowHeardAbout ?? null,
            } as any,
            { transaction: t },
          )
          return Buyer.create(
            {
              contactId: contact.id,
              notes: row.notes ?? null,
              targetCities: row.targetCities ?? [],
              targetZips: row.targetZips ?? [],
              targetCounties: row.targetCounties ?? [],
              targetStates: row.targetStates ?? [],
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

  return NextResponse.json({ success: true, created, merged, updated, skipped, skippedDetails, errors }, { status: 200 })
}
