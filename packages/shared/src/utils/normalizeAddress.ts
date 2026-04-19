export function normalizeAddress(
  street: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string | null {
  // Rule 1: Return null if street is null, undefined, or empty string
  if (street == null || street.trim() === '') {
    return null
  }

  // Rule 2: Lowercase everything
  let s = street.toLowerCase()

  // Rule 3: Remove periods and commas
  s = s.replace(/[.,]/g, '')

  // Rule 4: Replace #<value> with unit <value>
  s = s.replace(/#\s*(\S+)/g, 'unit $1')

  // Rule 7: Normalize unit designators (apt/apartment/suite/ste → unit)
  s = s.replace(/\b(apt|apartment|suite|ste)\b\s*/gi, 'unit ')

  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim()

  // Rule 6: Expand directional abbreviations (standalone tokens)
  const directionals: Record<string, string> = {
    ne: 'northeast',
    nw: 'northwest',
    se: 'southeast',
    sw: 'southwest',
    n: 'north',
    s: 'south',
    e: 'east',
    w: 'west',
  }

  // Replace directionals as whole words (case already lowercased)
  // Process compound ones first to avoid partial replacements
  s = s.replace(/\b(ne|nw|se|sw|n|s|e|w)\b/g, (match) => {
    return directionals[match] ?? match
  })

  // Rule 5: Expand street suffix abbreviations
  const suffixes: Record<string, string> = {
    st: 'street',
    ave: 'avenue',
    blvd: 'boulevard',
    dr: 'drive',
    rd: 'road',
    ln: 'lane',
    ct: 'court',
    pl: 'place',
    hwy: 'highway',
    way: 'way',
    cir: 'circle',
    ter: 'terrace',
    trl: 'trail',
    pkwy: 'parkway',
  }

  s = s.replace(/\b(st|ave|blvd|dr|rd|ln|ct|pl|hwy|way|cir|ter|trl|pkwy)\b/g, (match) => {
    return suffixes[match] ?? match
  })

  // Collapse any double spaces introduced by replacements
  s = s.replace(/\s+/g, ' ').trim()

  // Process city and state
  const cityNorm = city != null ? city.toLowerCase().trim() : ''
  const stateNorm = state != null ? state.toLowerCase().trim() : ''

  // Rule 8: Strip zip+4 suffix
  let zipNorm = ''
  if (zip != null) {
    zipNorm = zip.replace(/-\d{4}$/, '').trim()
  }

  // Rule 9: Output format: "{street}, {city}, {state} {zip}"
  // When state and zip are both empty (null inputs), produces "..., , " (trailing space from separator)
  // When only zip is empty, produces "..., city, state" (no trailing space)
  // When zip is present, produces "..., city, state zip"
  const stateZipPart = zipNorm
    ? `${stateNorm} ${zipNorm}`
    : `${stateNorm}`
  return `${s}, ${cityNorm}, ${stateZipPart}`
}
