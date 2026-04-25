import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const inPath = resolve(process.cwd(), '20260409101039-init-full-schema.sql.new')
const outPath = resolve(process.cwd(), '20260409101039-init-full-schema.sql')

const lines = readFileSync(inPath, 'utf8').split('\n')
const droppedTables = ['SequelizeMeta', '_prisma_migrations']

const result = []
let skipUntilBlank = false
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  if (skipUntilBlank) {
    if (line.trim() === '') skipUntilBlank = false
    continue
  }
  const matchesDroppedTable = droppedTables.some((t) =>
    line.includes('"' + t + '"') || line.includes('public.' + t),
  )
  if (matchesDroppedTable) {
    while (
      result.length > 0 &&
      (result[result.length - 1].startsWith('--') || result[result.length - 1].trim() === '')
    ) {
      result.pop()
    }
    skipUntilBlank = true
    continue
  }
  if (line.startsWith('\\restrict')) continue
  if (line.startsWith('\\unrestrict')) continue
  if (line.startsWith('-- Dumped from')) continue
  if (line.startsWith('-- Dumped by')) continue
  result.push(line)
}

const collapsed = []
let prevBlank = false
for (const line of result) {
  const isBlank = line.trim() === ''
  if (isBlank && prevBlank) continue
  collapsed.push(line)
  prevBlank = isBlank
}

writeFileSync(outPath, collapsed.join('\n'))
console.log('Kept ' + collapsed.length + ' of ' + lines.length + ' lines → ' + outPath)
