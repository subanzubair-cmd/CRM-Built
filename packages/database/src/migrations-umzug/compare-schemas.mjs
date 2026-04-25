// Order-insensitive schema comparison between two pg_dump --schema-only outputs.
//
// Why order-insensitive?
//   pg_dump iterates database objects in OID order, which differs between
//   databases that had objects created at different times (Prisma's migration
//   built the main DB over months; Umzug's init.sql builds the shadow DB in
//   one shot). The structural schema is identical but the SQL line order is
//   not — a line-by-line diff is uselessly noisy.
//
// Approach:
//   Parse each dump into "object blocks" delimited by `-- Name: X; Type: Y;`
//   headers. Drop expected-different blocks (SequelizeMeta, _prisma_migrations,
//   schema-level COMMENT). Sort the remaining blocks. Compare.
//
// Usage:
//   node compare-schemas.mjs /tmp/main.sql /tmp/shadow.sql
// Exit 0 if structurally identical, 1 otherwise.
import { readFileSync } from 'node:fs'

const droppedBlockNames = new Set(['SequelizeMeta', '_prisma_migrations'])

function parseBlocks(rawSql) {
  // Strip per-dump randomization + dump-time comments first.
  const cleaned = rawSql
    .split('\n')
    .filter((line) =>
      !line.startsWith('\\restrict') &&
      !line.startsWith('\\unrestrict') &&
      !line.startsWith('-- Dumped from') &&
      !line.startsWith('-- Dumped by'),
    )
    .join('\n')

  // Split into object blocks. Each block starts at a `-- Name: ` line and
  // runs through to the next `-- Name: ` line OR EOF.
  const blockHeaderRegex = /^-- Name: (\S+(?:\s+\S+)*); Type: (\S+);/m

  const blocks = []
  const lines = cleaned.split('\n')
  let preamble = []
  let current = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('-- Name: ')) {
      if (current) {
        blocks.push(current)
      } else if (preamble.length > 0) {
        // Preamble lines (SET, etc.) before the first block. Discard for
        // comparison purposes — they don't affect schema.
        preamble = []
      }
      const match = line.match(blockHeaderRegex)
      const name = match ? match[1] : line
      const type = match ? match[2] : '?'
      current = { key: `${type}::${name}`, lines: [line] }
    } else if (current) {
      current.lines.push(line)
    } else {
      preamble.push(line)
    }
  }
  if (current) blocks.push(current)

  // Trim trailing blank lines from each block, drop fully-empty ones, and
  // remove the bookkeeping table blocks.
  return blocks
    .map((b) => {
      while (b.lines.length > 0 && b.lines[b.lines.length - 1].trim() === '') {
        b.lines.pop()
      }
      return b
    })
    .filter((b) => {
      if (b.lines.length === 0) return false
      // Filter blocks that name our bookkeeping tables in any form.
      // The `-- Name: <id>; Type: <T>;` line uses different ids:
      //   for TABLE  → `<TableName>`
      //   for INDEX  → `<TableName> <IndexName>` (composite)
      //   for CONSTRAINT → `<TableName> <ConstraintName>`
      //   for SEQUENCE → `<SequenceName>` etc.
      // So we test if the FIRST whitespace-delimited token is a dropped name.
      const headerMatch = b.lines[0].match(blockHeaderRegex)
      if (headerMatch) {
        const firstToken = headerMatch[1].split(/\s+/)[0]
        if (droppedBlockNames.has(firstToken)) return false
        if (headerMatch[2] === 'SCHEMA') return false   // schema-level definition differs cosmetically
        if (headerMatch[2] === 'COMMENT') return false  // COMMENT ON SCHEMA / EXTENSION etc. — cosmetic
      }
      return true
    })
}

function canonicalKey(blocks) {
  // Build a sorted, normalized representation of all blocks for comparison.
  return blocks
    .map((b) => {
      // Collapse runs of blank lines + trim surrounding whitespace.
      const text = b.lines
        .map((l) => l.replace(/\s+$/, ''))
        .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
        .join('\n')
        .trim()
      return { key: b.key, text }
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

const [pathA, pathB] = process.argv.slice(2)
if (!pathA || !pathB) {
  console.error('usage: node compare-schemas.mjs <main.sql> <shadow.sql>')
  process.exit(2)
}

const a = canonicalKey(parseBlocks(readFileSync(pathA, 'utf8')))
const b = canonicalKey(parseBlocks(readFileSync(pathB, 'utf8')))

console.log(`main blocks:   ${a.length}`)
console.log(`shadow blocks: ${b.length}`)

const aKeys = new Set(a.map((x) => x.key))
const bKeys = new Set(b.map((x) => x.key))
const onlyInA = [...aKeys].filter((k) => !bKeys.has(k))
const onlyInB = [...bKeys].filter((k) => !aKeys.has(k))
if (onlyInA.length || onlyInB.length) {
  console.log('✗ Different object sets:')
  for (const k of onlyInA) console.log('  - main only:   ' + k)
  for (const k of onlyInB) console.log('  + shadow only: ' + k)
  process.exit(1)
}

const aMap = new Map(a.map((x) => [x.key, x.text]))
const bMap = new Map(b.map((x) => [x.key, x.text]))
const differingBlocks = []
for (const key of aMap.keys()) {
  if (aMap.get(key) !== bMap.get(key)) {
    differingBlocks.push(key)
  }
}

if (differingBlocks.length === 0) {
  console.log(`✓ Structural schemas match (${a.length} objects compared)`)
  process.exit(0)
}

console.log(`✗ ${differingBlocks.length} blocks differ in content:`)
for (const key of differingBlocks.slice(0, 5)) {
  console.log(`\n  ── ${key} ──`)
  const aLines = aMap.get(key).split('\n')
  const bLines = bMap.get(key).split('\n')
  const maxLen = Math.max(aLines.length, bLines.length)
  for (let i = 0; i < maxLen; i++) {
    if (aLines[i] !== bLines[i]) {
      if (aLines[i] !== undefined) console.log('  - ' + aLines[i])
      if (bLines[i] !== undefined) console.log('  + ' + bLines[i])
    }
  }
}
process.exit(1)
