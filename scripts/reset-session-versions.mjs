#!/usr/bin/env node
/**
 * Reset User.sessionVersion = 0 for every user.
 *
 * Why: the original integrity-pass design bumped sessionVersion on any
 * permission change, which neutered every in-flight JWT (permissions=[]).
 * Users could only unstick by signing out and back in. We reverted that
 * design — permission changes no longer bump sessionVersion — so the only
 * remaining task is to unstick the users whose tokens are currently orphaned.
 *
 * Resetting to 0 means any existing token (which reads `token.sessionVersion
 * ?? 0`) will match the DB, fall into the "not revoked" branch of the jwt()
 * callback, and pull fresh permissions from DB on the next revalidation.
 *
 * Idempotent: safe to run multiple times.
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  const result = await prisma.user.updateMany({
    where: { sessionVersion: { not: 0 } },
    data: { sessionVersion: 0 },
  })
  console.log(`[reset-session-versions] ${result.count} user(s) reset to sessionVersion=0`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
