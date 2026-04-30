/**
 * CSV import executor for Buyers / Vendors.
 *
 * One BullMQ job per ImportJob row. The worker:
 *   1. Fetches the CSV from MinIO via fileStorageKey.
 *   2. Parses it with a small hand-rolled tokenizer (handles quoted
 *      fields + embedded commas/newlines — sufficient for the
 *      simple CRM CSV shape we ingest).
 *   3. Creates Contact + Buyer (or Vendor) per row inside a single
 *      per-row transaction. Skips duplicate phone/email matches and
 *      records a row-level failure for everything else.
 *   4. Updates ImportJob counters + flips status when done.
 *
 * No column-mapping UI in v1: the CSV header is expected to contain
 * `firstName, lastName, email, phone, mailingAddress` (case-
 * insensitive, in any order). Anything else is ignored.
 */

import {
  ImportJob,
  ImportJobRow,
  Contact,
  Buyer,
  Vendor,
  Op,
  sequelize,
} from '@crm/database'
import { minioClient } from './minio.js'

const BUCKET = 'crm-files'

interface ParsedRow {
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  mailingAddress: string | null
}

export interface CsvImportJobData {
  jobId: string
}

export async function processCsvImportJob(data: CsvImportJobData): Promise<void> {
  const job = await ImportJob.findByPk(data.jobId)
  if (!job) {
    console.warn(`[csv-import] job ${data.jobId} not found`)
    return
  }
  const status = job.get('status') as string
  if (status !== 'QUEUED') return // already processed / cancelled

  await job.update({ status: 'PROCESSING' } as any)

  let csvText = ''
  try {
    const key = job.get('fileStorageKey') as string | null
    if (!key) throw new Error('fileStorageKey missing')
    const stream = await minioClient.getObject(BUCKET, key)
    csvText = await streamToString(stream)
  } catch (err) {
    await job.update({
      status: 'FAILED',
      errorMessage: err instanceof Error ? err.message : String(err),
      completedAt: new Date(),
    } as any)
    return
  }

  const { headers, rows } = parseCsv(csvText)
  const colIndex = (name: string) =>
    headers.findIndex((h) => h.toLowerCase().trim() === name.toLowerCase())

  const idxFirstName = colIndex('firstName')
  if (idxFirstName === -1) {
    await job.update({
      status: 'FAILED',
      errorMessage:
        'CSV header must contain at least a `firstName` column. Got: ' +
        headers.join(', '),
      completedAt: new Date(),
    } as any)
    return
  }
  const idxLastName = colIndex('lastName')
  const idxEmail = colIndex('email')
  const idxPhone = colIndex('phone')
  const idxMailing = colIndex('mailingAddress')

  let processed = 0
  let failed = 0
  const moduleType = job.get('module') as 'BUYERS' | 'VENDORS'

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]
    const parsed: ParsedRow = {
      firstName: (cells[idxFirstName] ?? '').trim(),
      lastName: idxLastName >= 0 ? (cells[idxLastName] ?? '').trim() || null : null,
      email: idxEmail >= 0 ? (cells[idxEmail] ?? '').trim() || null : null,
      phone: idxPhone >= 0 ? (cells[idxPhone] ?? '').trim() || null : null,
      mailingAddress:
        idxMailing >= 0 ? (cells[idxMailing] ?? '').trim() || null : null,
    }

    if (!parsed.firstName) {
      await ImportJobRow.create({
        jobId: job.id,
        rowIndex: i + 2, // +2 because header is row 1, data starts row 2
        succeeded: false,
        error: 'firstName is required',
        rawRow: { headers, cells } as any,
      } as any)
      failed++
      continue
    }

    try {
      const result = await sequelize.transaction(async (t) => {
        // Dedupe by phone/email — skip the row if a contact of the
        // same module already exists with that contact info.
        const contactType = moduleType === 'BUYERS' ? 'BUYER' : 'VENDOR'
        const dupe = parsed.phone || parsed.email
          ? await Contact.findOne({
              where: {
                type: contactType,
                [Op.or]: [
                  ...(parsed.phone ? [{ phone: parsed.phone }] : []),
                  ...(parsed.email ? [{ email: parsed.email }] : []),
                ],
              } as any,
              transaction: t,
            })
          : null
        if (dupe) {
          throw new Error(
            `Duplicate contact (${parsed.phone ?? parsed.email}) — skipped`,
          )
        }

        const contact = await Contact.create(
          {
            type: contactType,
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            email: parsed.email,
            phone: parsed.phone,
            phones: parsed.phone
              ? [{ label: 'primary', number: parsed.phone }]
              : [],
            emails: parsed.email
              ? [{ label: 'primary', email: parsed.email }]
              : [],
            mailingAddress: parsed.mailingAddress,
          } as any,
          { transaction: t },
        )

        if (moduleType === 'BUYERS') {
          const buyer = await Buyer.create(
            { contactId: contact.id } as any,
            { transaction: t },
          )
          return buyer.id
        } else {
          const vendor = await Vendor.create(
            { contactId: contact.id } as any,
            { transaction: t },
          )
          return vendor.id
        }
      })

      await ImportJobRow.create({
        jobId: job.id,
        rowIndex: i + 2,
        succeeded: true,
        rawRow: { headers, cells } as any,
        createdEntityId: result,
      } as any)
      processed++
    } catch (err) {
      await ImportJobRow.create({
        jobId: job.id,
        rowIndex: i + 2,
        succeeded: false,
        error: err instanceof Error ? err.message : String(err),
        rawRow: { headers, cells } as any,
      } as any)
      failed++
    }

    // Periodic counter rollup so the UI shows progress on long imports.
    if ((processed + failed) % 25 === 0) {
      await job.update({
        totalRows: rows.length,
        processedRows: processed,
        failedRows: failed,
      } as any)
    }
  }

  await job.update({
    status: 'COMPLETED',
    totalRows: rows.length,
    processedRows: processed,
    failedRows: failed,
    completedAt: new Date(),
  } as any)
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream as any) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Minimal RFC4180-ish CSV parser. Handles double-quoted fields with
 * embedded commas / newlines / escaped quotes. Returns header row +
 * data rows, all as string[]. We don't pull in a CSV library because
 * the input shape is simple and we want to keep the dependency
 * surface flat.
 */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const all: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field)
        field = ''
      } else if (c === '\n') {
        row.push(field)
        if (row.some((v) => v.trim() !== '')) all.push(row)
        row = []
        field = ''
      } else if (c === '\r') {
        // ignore — \r\n handled by \n branch
      } else {
        field += c
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((v) => v.trim() !== '')) all.push(row)
  }
  if (all.length === 0) return { headers: [], rows: [] }
  return { headers: all[0], rows: all.slice(1) }
}
