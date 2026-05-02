import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ImportJob, Buyer, Contact, sequelize } from '@crm/database'
import { minioClient } from '@/lib/minio'
import { Buffer } from 'node:buffer'
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { z } from 'zod'
import { normalizePhone } from '@/lib/phone'
import { findDuplicateContact } from '@/lib/dedupe'

/**
 * POST /api/buyers/import
 *
 * Two modes:
 *
 * 1. JSON body { rows, columnMap } — synchronous direct import.
 *    `rows` is an array of raw CSV row objects (header → value),
 *    `columnMap` maps each CSV header to a system field key.
 *    Returns { created, merged, skipped, errors }.
 *
 * 2. multipart/form-data with a `file` field — queued MinIO path
 *    (original behaviour). Returns { success, data: ImportJob }.
 *
 * GET /api/buyers/import
 *   List recent ImportJob rows for the Import Log tab.
 */

const BUCKET = 'crm-files'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** System field keys the column mapper can produce. */
type SystemFieldKey =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'tags'
  | 'howHeardAbout'
  | 'mailingAddress'
  | 'notes'
  | 'targetCities'
  | 'targetZips'
  | 'targetCounties'
  | 'targetStates'
  | 'source'

const DO_NOT_IMPORT = '__skip__'

/** Mapped row produced after applying columnMap to a raw CSV row. */
interface MappedRow {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  tags?: string[]
  howHeardAbout?: string
  mailingAddress?: string
  notes?: string
  targetCities?: string[]
  targetZips?: string[]
  targetCounties?: string[]
  targetStates?: string[]
  source?: string
}

// ─────────────────────────────────────────────
// Zod schema for synchronous import
// ─────────────────────────────────────────────

const SyncImportSchema = z.object({
  rows: z.array(z.record(z.string())).min(1).max(2000),
  columnMap: z.record(z.string()),
})

// ─────────────────────────────────────────────
// Column mapping helper
// ─────────────────────────────────────────────

function applyColumnMap(
  rawRow: Record<string, string>,
  columnMap: Record<string, string>,
): MappedRow {
  const out: MappedRow = {}

  for (const [csvHeader, sysKey] of Object.entries(columnMap)) {
    if (sysKey === DO_NOT_IMPORT) continue
    const val = (rawRow[csvHeader] ?? '').trim()
    if (!val) continue

    switch (sysKey as SystemFieldKey) {
      case 'firstName':
        out.firstName = val
        break
      case 'lastName':
        out.lastName = val
        break
      case 'fullName': {
        const parts = val.split(/\s+/)
        if (!out.firstName) out.firstName = parts[0] ?? val
        if (!out.lastName && parts.length > 1) out.lastName = parts.slice(1).join(' ')
        break
      }
      case 'phone':
        out.phone = val
        break
      case 'email':
        out.email = val
        break
      case 'tags':
        out.tags = val.split(',').map((t) => t.trim()).filter(Boolean)
        break
      case 'howHeardAbout':
        out.howHeardAbout = val
        break
      case 'mailingAddress':
        out.mailingAddress = val
        break
      case 'notes':
        out.notes = val
        break
      case 'targetCities':
        out.targetCities = val.split(',').map((t) => t.trim()).filter(Boolean)
        break
      case 'targetZips':
        out.targetZips = val.split(',').map((t) => t.trim()).filter(Boolean)
        break
      case 'targetCounties':
        out.targetCounties = val.split(',').map((t) => t.trim()).filter(Boolean)
        break
      case 'targetStates':
        out.targetStates = val.split(',').map((t) => t.trim()).filter(Boolean)
        break
      case 'source':
        // source maps to howHeardAbout if howHeardAbout isn't already set
        if (!out.howHeardAbout) out.howHeardAbout = val
        break
    }
  }

  return out
}

// ─────────────────────────────────────────────
// GET — list import jobs
// ─────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await ImportJob.findAll({
    where: { module: 'BUYERS' as any },
    order: [['createdAt', 'DESC']],
    limit: 100,
  })
  return NextResponse.json({ data: rows.map((r) => r.get({ plain: true })) })
}

// ─────────────────────────────────────────────
// POST — synchronous import OR MinIO queue
// ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') ?? ''

  // ── Synchronous path: JSON body with rows + columnMap ──
  if (contentType.includes('application/json')) {
    const body = await req.json()
    const parsed = SyncImportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { rows, columnMap } = parsed.data

    let created = 0
    let merged = 0
    let skipped = 0
    const errors: string[] = []

    for (const rawRow of rows) {
      try {
        const row = applyColumnMap(rawRow, columnMap)

        // firstName is required
        if (!row.firstName) {
          skipped++
          continue
        }

        const normalizedPhone = row.phone ? (normalizePhone(row.phone) ?? row.phone) : undefined
        const allPhones = normalizedPhone ? [normalizedPhone] : []
        const allEmails = row.email ? [row.email] : []

        // Skip rows with no contact info
        if (allPhones.length === 0 && allEmails.length === 0) {
          skipped++
          continue
        }

        const dup = await findDuplicateContact({
          allPhones,
          allEmails,
          contactType: 'BUYER',
        })

        if (dup?.buyerId) {
          // Existing buyer — fill in MISSING fields only (never overwrite existing data)
          if (dup.contact?.id) {
            const existingContact = await Contact.findByPk(dup.contact.id, { raw: true }) as any
            const updatePayload: Record<string, unknown> = {}

            if (!existingContact?.phone && normalizedPhone) updatePayload.phone = normalizedPhone
            if (!existingContact?.email && row.email) updatePayload.email = row.email
            if (!existingContact?.lastName && row.lastName) updatePayload.lastName = row.lastName
            if (!existingContact?.notes && row.notes) updatePayload.notes = row.notes
            if (!existingContact?.howHeardAbout && row.howHeardAbout) updatePayload.howHeardAbout = row.howHeardAbout
            if (!existingContact?.mailingAddress && row.mailingAddress) updatePayload.mailingAddress = row.mailingAddress

            if (row.tags && row.tags.length > 0) {
              // Append new tags — never remove existing
              const existingTags: string[] = existingContact?.tags ?? []
              const merged_tags = Array.from(new Set([...existingTags, ...row.tags]))
              if (merged_tags.length > existingTags.length) updatePayload.tags = merged_tags
            }
            // Sync phones JSONB if we filled the scalar phone
            if (updatePayload.phone && normalizedPhone) {
              const existingPhones: Array<{ label: string; number: string }> = existingContact?.phones ?? []
              const digits10 = normalizedPhone.replace(/\D/g, '').slice(-10)
              const alreadyIn = existingPhones.some((p) => p.number?.replace(/\D/g, '').endsWith(digits10))
              if (!alreadyIn) updatePayload.phones = [...existingPhones, { label: 'Mobile', number: normalizedPhone }]
            }

            if (Object.keys(updatePayload).length > 0) {
              await Contact.update(updatePayload, { where: { id: dup.contact.id } })
            }
            // Merge geo data onto the buyer row (only fill empty arrays)
            if (dup.buyerId) {
              const existingBuyer = await Buyer.findByPk(dup.buyerId, { raw: true }) as any
              const buyerUpdate: Record<string, unknown> = {}
              if (!existingBuyer?.targetCities?.length && row.targetCities?.length) buyerUpdate.targetCities = row.targetCities
              if (!existingBuyer?.targetZips?.length && row.targetZips?.length) buyerUpdate.targetZips = row.targetZips
              if (!existingBuyer?.targetCounties?.length && row.targetCounties?.length) buyerUpdate.targetCounties = row.targetCounties
              if (!existingBuyer?.targetStates?.length && row.targetStates?.length) buyerUpdate.targetStates = row.targetStates
              if (!existingBuyer?.notes && row.notes) buyerUpdate.notes = row.notes
              if (Object.keys(buyerUpdate).length > 0) {
                await Buyer.update(buyerUpdate, { where: { id: dup.buyerId } })
              }
            }
          }
          merged++
        } else {
          // New buyer — create Contact + Buyer in a transaction
          await sequelize.transaction(async (t) => {
            const contact = await Contact.create(
              {
                type: 'BUYER',
                firstName: row.firstName!,
                lastName: row.lastName ?? null,
                phone: normalizedPhone ?? null,
                email: row.email ?? null,
                phones: normalizedPhone ? [{ label: 'Mobile', number: normalizedPhone }] : [],
                emails: row.email ? [{ label: 'Primary', email: row.email }] : [],
                mailingAddress: row.mailingAddress ?? null,
                howHeardAbout: row.howHeardAbout ?? null,
                notes: row.notes ?? null,
                tags: row.tags ?? [],
              } as any,
              { transaction: t },
            )
            await Buyer.create(
              {
                contactId: contact.id,
                targetCities: row.targetCities ?? [],
                targetZips: row.targetZips ?? [],
                targetCounties: row.targetCounties ?? [],
                targetStates: row.targetStates ?? [],
              } as any,
              { transaction: t },
            )
          })
          created++
        }
      } catch (err: any) {
        errors.push(`Row (${rawRow['firstName'] ?? rawRow['name'] ?? '?'}): ${err?.message ?? 'unknown error'}`)
      }
    }

    return NextResponse.json(
      { success: true, created, merged, skipped, errors },
      { status: 200 },
    )
  }

  // ── MinIO queue path (original) ──
  const userId = ((session as any)?.user?.id ?? '') as string

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 422 })
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'CSV must be smaller than 25 MB.' },
      { status: 413 },
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const storageKey = `imports/buyers/${Date.now()}-${file.name}`

  // Stash the raw CSV in MinIO so the worker can stream it back.
  await minioClient.putObject(BUCKET, storageKey, buffer, buffer.length, {
    'content-type': file.type || 'text/csv',
  })

  const job = await ImportJob.create({
    module: 'BUYERS' as any,
    createdById: userId || null,
    fileName: file.name,
    fileSize: buffer.length,
    fileStorageKey: storageKey,
    status: 'QUEUED' as any,
  } as any)

  try {
    const connection = new Redis(
      process.env.REDIS_URL ?? 'redis://localhost:6379',
      { maxRetriesPerRequest: null, enableOfflineQueue: false, lazyConnect: true },
    )
    const queue = new Queue('csv-import', { connection })
    await queue.add('process', { jobId: job.id })
  } catch (err) {
    console.warn('[buyers/import] enqueue failed (job stays QUEUED):', err)
  }

  return NextResponse.json({ success: true, data: job }, { status: 201 })
}
