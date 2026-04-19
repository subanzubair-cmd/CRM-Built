import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getLeadList } from '@/lib/leads'
import type { LeadPipeline } from '@/lib/leads'
import { getTmList, getInventoryList, getDispoList } from '@/lib/pipelines'
import { getSoldList, getRentalList } from '@/lib/archive'
import { requirePermission } from '@/lib/auth-utils'

function escapeCsv(val: string | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const STAGE_LABELS: Record<string, string> = {
  // Lead stages
  NEW_LEAD: 'New Lead',
  DISCOVERY: 'Discovery',
  INTERESTED_ADD_TO_FOLLOW_UP: 'Follow Up',
  APPOINTMENT_MADE: 'Appointment',
  DUE_DILIGENCE: 'Due Diligence',
  OFFER_MADE: 'Offer Made',
  OFFER_FOLLOW_UP: 'Offer Follow Up',
  UNDER_CONTRACT: 'Under Contract',
  // TM stages
  NEW_CONTRACT: 'New Contract',
  MARKETING_TO_BUYERS: 'Marketing to Buyers',
  SHOWING_TO_BUYERS: 'Showing to Buyers',
  EVALUATING_OFFERS: 'Evaluating Offers',
  ACCEPTED_OFFER: 'Accepted Offer',
  CLEAR_TO_CLOSE: 'Clear to Close',
  // Inventory stages
  NEW_INVENTORY: 'New Inventory',
  GETTING_ESTIMATES: 'Getting Estimates',
  UNDER_REHAB: 'Under Rehab',
  LISTED_FOR_SALE: 'Listed for Sale',
}

const LEAD_PIPELINES = new Set(['dts', 'dta', 'warm', 'dead', 'referred'])

export async function GET(req: NextRequest) {
  const session = await auth()
  const deny = requirePermission(session, 'leads.view')
  if (deny) return deny

  const sp = req.nextUrl.searchParams
  const pipeline = sp.get('pipeline') ?? 'dts'
  const stage = sp.get('stage') ?? undefined
  const assignedToId = sp.get('assignedToId') ?? undefined
  const search = sp.get('search') ?? undefined
  const isHot = sp.get('isHot') === '1' ? true : undefined

  const headers = ['Address', 'City', 'State', 'Zip', 'Stage', 'Contact Name', 'Contact Phone', 'Assigned To', 'Created At']
  const lines: string[] = [headers.join(',')]

  function buildPropertyRow(row: any, stageValue: string | null | undefined): string {
    const contact = row.contacts?.[0]?.contact
    return [
      escapeCsv(row.streetAddress),
      escapeCsv(row.city),
      escapeCsv(row.state),
      escapeCsv(row.zip),
      escapeCsv(stageValue ? (STAGE_LABELS[stageValue] ?? stageValue) : ''),
      escapeCsv(contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : ''),
      escapeCsv(contact?.phone ?? ''),
      escapeCsv(row.assignedTo?.name ?? ''),
      row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : '',
    ].join(',')
  }

  if (LEAD_PIPELINES.has(pipeline)) {
    const { rows } = await getLeadList({
      pipeline: pipeline as LeadPipeline,
      stage,
      assignedToId,
      search,
      isHot,
      pageSize: 5000,
    })

    for (const row of rows) {
      const contact = (row as any).contacts?.[0]?.contact
      lines.push([
        escapeCsv(row.streetAddress),
        escapeCsv(row.city),
        escapeCsv(row.state),
        escapeCsv((row as any).zip),
        escapeCsv(row.activeLeadStage ? (STAGE_LABELS[row.activeLeadStage] ?? row.activeLeadStage) : ''),
        escapeCsv(contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : ''),
        escapeCsv(contact?.phone ?? ''),
        escapeCsv((row as any).assignedTo?.name ?? ''),
        (row as any).createdAt ? new Date((row as any).createdAt).toISOString().slice(0, 10) : '',
      ].join(','))
    }
  } else if (pipeline === 'tm') {
    const { rows } = await getTmList({ assignedToId, search, pageSize: 5000 })
    for (const row of rows) {
      lines.push(buildPropertyRow(row, (row as any).tmStage))
    }
  } else if (pipeline === 'inventory') {
    const { rows } = await getInventoryList({ assignedToId, search, pageSize: 5000 })
    for (const row of rows) {
      lines.push(buildPropertyRow(row, (row as any).inventoryStage))
    }
  } else if (pipeline === 'dispo') {
    const { rows } = await getDispoList({ assignedToId, search, pageSize: 5000 })
    for (const row of rows) {
      lines.push(buildPropertyRow(row, null))
    }
  } else if (pipeline === 'sold') {
    const { rows } = await getSoldList({ assignedToId, search, pageSize: 5000 })
    for (const row of rows) {
      lines.push(buildPropertyRow(row, null))
    }
  } else if (pipeline === 'rental') {
    const { rows } = await getRentalList({ assignedToId, search, pageSize: 5000 })
    for (const row of rows) {
      lines.push(buildPropertyRow(row, null))
    }
  }

  const csv = lines.join('\r\n')
  const filename = `leads-${pipeline}-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
