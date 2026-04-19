/**
 * Property Data adapter — provider-agnostic address lookup.
 *
 * Returns enriched property attributes from a third-party data API.
 * Provider selection via PROPERTY_DATA_PROVIDER env var:
 *   'attom'      — Attom Data API
 *   'batchdata'  — BatchData API
 *   'mock'       — returns fake data (default when no credentials)
 *
 * Required env vars (per provider):
 *   ATTOM_API_KEY, BATCHDATA_API_KEY
 */

import axios from 'axios'

export interface PropertyDataResult {
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  yearBuilt?: number
  lotSize?: number      // sq ft
  propertyType?: string // 'SFR', 'CONDO', 'MULTI', etc.
  arv?: number          // After Repair Value estimate in dollars
}

async function lookupAttom(address: string): Promise<PropertyDataResult> {
  const apiKey = process.env.ATTOM_API_KEY
  if (!apiKey) throw new Error('ATTOM_API_KEY not set')

  const res = await axios.get('https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/basicprofile', {
    params: { address1: address },
    headers: { apikey: apiKey, accept: 'application/json' },
  })

  const p = res.data?.property?.[0]?.building ?? {}
  return {
    bedrooms: p.rooms?.beds,
    bathrooms: p.rooms?.bathsFull,
    sqft: p.size?.livingsize,
    yearBuilt: p.summary?.yearbuilt,
    lotSize: res.data?.property?.[0]?.lot?.lotsize1,
    propertyType: res.data?.property?.[0]?.summary?.proptype,
  }
}

async function lookupBatchData(address: string): Promise<PropertyDataResult> {
  const apiKey = process.env.BATCHDATA_API_KEY
  if (!apiKey) throw new Error('BATCHDATA_API_KEY not set')

  const res = await axios.post(
    'https://api.batchdata.com/api/v1/property/lookup',
    { requests: [{ address }] },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
  )

  const p = res.data?.results?.properties?.[0] ?? {}
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

function mockLookup(address: string): PropertyDataResult {
  console.log(`[property-data] MOCK lookup for: ${address}`)
  return {
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1450,
    yearBuilt: 1998,
    lotSize: 6000,
    propertyType: 'SFR',
    arv: 245000,
  }
}

export async function lookupAddress(address: string): Promise<PropertyDataResult> {
  const provider = process.env.PROPERTY_DATA_PROVIDER ?? 'mock'

  switch (provider) {
    case 'attom':
      return lookupAttom(address)
    case 'batchdata':
      return lookupBatchData(address)
    default:
      return mockLookup(address)
  }
}
