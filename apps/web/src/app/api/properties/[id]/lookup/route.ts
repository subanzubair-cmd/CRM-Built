/**
 * POST /api/properties/[id]/lookup
 *
 * Fetches enriched property data from the configured PROPERTY_DATA_PROVIDER
 * (attom | batchdata | mock) and returns the result.
 *
 * The client shows a confirmation dialog before saving — this route only
 * returns the data; the client calls PATCH /api/leads/[id] to persist.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const property = await prisma.property.findUnique({
    where: { id },
    select: { id: true, streetAddress: true, city: true, state: true, zip: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const address = [property.streetAddress, property.city, property.state, property.zip]
    .filter(Boolean)
    .join(', ')

  try {
    const data = await lookupPropertyData(address)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[lookup] property data fetch failed:', err)
    return NextResponse.json({ error: 'Data provider error' }, { status: 502 })
  }
}

// ── Provider-agnostic lookup ───────────────────────────────────────────────────
//
// Inline implementation (mirrors apps/api/src/lib/property-data-adapter.ts)
// to avoid cross-package imports in the Next.js app.

interface PropertyDataResult {
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  yearBuilt?: number
  lotSize?: number
  propertyType?: string
  arv?: number
}

async function lookupPropertyData(address: string): Promise<PropertyDataResult> {
  const provider = process.env.PROPERTY_DATA_PROVIDER ?? 'mock'

  if (provider === 'attom') {
    const apiKey = process.env.ATTOM_API_KEY
    if (!apiKey) throw new Error('ATTOM_API_KEY not set')
    const res = await fetch(
      `https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/basicprofile?address1=${encodeURIComponent(address)}`,
      { headers: { apikey: apiKey, accept: 'application/json' } },
    )
    const json = (await res.json()) as any
    const p = json?.property?.[0]?.building ?? {}
    return {
      bedrooms: p.rooms?.beds,
      bathrooms: p.rooms?.bathsFull,
      sqft: p.size?.livingsize,
      yearBuilt: p.summary?.yearbuilt,
      lotSize: json?.property?.[0]?.lot?.lotsize1,
      propertyType: json?.property?.[0]?.summary?.proptype,
    }
  }

  if (provider === 'batchdata') {
    const apiKey = process.env.BATCHDATA_API_KEY
    if (!apiKey) throw new Error('BATCHDATA_API_KEY not set')
    const res = await fetch('https://api.batchdata.com/api/v1/property/lookup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ address }] }),
    })
    const json = (await res.json()) as any
    const p = json?.results?.properties?.[0] ?? {}
    return {
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      sqft: p.squareFeet,
      yearBuilt: p.yearBuilt,
      lotSize: p.lotSquareFeet,
      propertyType: p.propertyType,
      arv: p.estimatedValue,
    }
  }

  // Mock
  console.log(`[lookup] MOCK data for: ${address}`)
  return { bedrooms: 3, bathrooms: 2, sqft: 1450, yearBuilt: 1998, lotSize: 6000, propertyType: 'SFR', arv: 245000 }
}
