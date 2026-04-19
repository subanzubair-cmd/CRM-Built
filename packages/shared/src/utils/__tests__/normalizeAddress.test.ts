import { describe, it, expect } from 'vitest'
import { normalizeAddress } from '../normalizeAddress'

describe('normalizeAddress', () => {
  it('returns null when no street address provided', () => {
    expect(normalizeAddress(null, 'Dallas', 'TX', '75201')).toBeNull()
    expect(normalizeAddress(undefined, 'Dallas', 'TX', '75201')).toBeNull()
    expect(normalizeAddress('', 'Dallas', 'TX', '75201')).toBeNull()
  })

  it('lowercases and trims all components', () => {
    expect(normalizeAddress('123 Oak Street', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street, dallas, tx 75201')
  })

  it('expands street abbreviations', () => {
    expect(normalizeAddress('123 N. Oak St.', 'Dallas', 'TX', '75201'))
      .toBe('123 north oak street, dallas, tx 75201')
    expect(normalizeAddress('456 Elm Ave', 'Austin', 'TX', '78701'))
      .toBe('456 elm avenue, austin, tx 78701')
    expect(normalizeAddress('789 Main Blvd', 'Houston', 'TX', '77001'))
      .toBe('789 main boulevard, houston, tx 77001')
    expect(normalizeAddress('100 Park Dr', 'Plano', 'TX', '75024'))
      .toBe('100 park drive, plano, tx 75024')
    expect(normalizeAddress('200 River Rd', 'Austin', 'TX', '78702'))
      .toBe('200 river road, austin, tx 78702')
    expect(normalizeAddress('300 Maple Ln', 'Dallas', 'TX', '75202'))
      .toBe('300 maple lane, dallas, tx 75202')
    expect(normalizeAddress('400 Cedar Ct', 'Dallas', 'TX', '75203'))
      .toBe('400 cedar court, dallas, tx 75203')
    expect(normalizeAddress('500 Oak Pl', 'Dallas', 'TX', '75204'))
      .toBe('500 oak place, dallas, tx 75204')
    expect(normalizeAddress('600 State Hwy 75', 'Dallas', 'TX', '75205'))
      .toBe('600 state highway 75, dallas, tx 75205')
  })

  it('expands directional abbreviations', () => {
    expect(normalizeAddress('123 N Oak St', 'Dallas', 'TX', '75201'))
      .toBe('123 north oak street, dallas, tx 75201')
    expect(normalizeAddress('123 S Elm Ave', 'Dallas', 'TX', '75201'))
      .toBe('123 south elm avenue, dallas, tx 75201')
    expect(normalizeAddress('123 E Main St', 'Dallas', 'TX', '75201'))
      .toBe('123 east main street, dallas, tx 75201')
    expect(normalizeAddress('123 W Park Dr', 'Dallas', 'TX', '75201'))
      .toBe('123 west park drive, dallas, tx 75201')
    expect(normalizeAddress('123 NE Oak Ave', 'Dallas', 'TX', '75201'))
      .toBe('123 northeast oak avenue, dallas, tx 75201')
    expect(normalizeAddress('123 NW Elm Rd', 'Dallas', 'TX', '75201'))
      .toBe('123 northwest elm road, dallas, tx 75201')
    expect(normalizeAddress('123 SE Main Blvd', 'Dallas', 'TX', '75201'))
      .toBe('123 southeast main boulevard, dallas, tx 75201')
    expect(normalizeAddress('123 SW Pine Ct', 'Dallas', 'TX', '75201'))
      .toBe('123 southwest pine court, dallas, tx 75201')
  })

  it('normalizes unit designators', () => {
    expect(normalizeAddress('123 Oak St Apt 4B', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street unit 4b, dallas, tx 75201')
    expect(normalizeAddress('123 Oak St Suite 200', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street unit 200, dallas, tx 75201')
    expect(normalizeAddress('123 Oak St Ste 200', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street unit 200, dallas, tx 75201')
    expect(normalizeAddress('123 Oak St #4B', 'Dallas', 'TX', '75201'))
      .toBe('123 oak street unit 4b, dallas, tx 75201')
  })

  it('strips zip+4 suffix from zip code', () => {
    expect(normalizeAddress('123 Oak St', 'Dallas', 'TX', '75201-1234'))
      .toBe('123 oak street, dallas, tx 75201')
  })

  it('removes punctuation (periods, commas)', () => {
    expect(normalizeAddress('123 N. Oak St., Apt. 4B', 'Dallas', 'TX', '75201'))
      .toBe('123 north oak street unit 4b, dallas, tx 75201')
  })

  it('handles missing city/state/zip gracefully', () => {
    expect(normalizeAddress('123 Oak St', null, null, null))
      .toBe('123 oak street, , ')
  })

  it('full integration: messy real-world address', () => {
    expect(normalizeAddress('123 N. Oak St., Apt. 4B', 'Dallas', 'TX', '75201-1234'))
      .toBe('123 north oak street unit 4b, dallas, tx 75201')
  })
})
