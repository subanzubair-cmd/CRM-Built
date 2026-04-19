#!/usr/bin/env node
/**
 * Copy Role.permissions → User.permissions for any user whose user.permissions
 * is empty. Run after the auth.ts change that removed the role-fallback at
 * sign-in time. Idempotent: users with non-empty permissions are skipped.
 *
 * Bumps sessionVersion on each backfilled user so their next JWT revalidation
 * picks up the new permissions without waiting for token expiry.
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      permissions: true,
      role: { select: { name: true, permissions: true } },
    },
  })

  let updated = 0
  let skipped = 0
  for (const u of users) {
    if (u.permissions.length > 0) {
      skipped++
      continue
    }
    if (!u.role?.permissions?.length) {
      console.log(`[skip] ${u.email} — role has no permissions either`)
      skipped++
      continue
    }
    await prisma.user.update({
      where: { id: u.id },
      data: {
        permissions: u.role.permissions,
        sessionVersion: { increment: 1 },
      },
    })
    console.log(`[ok]   ${u.email} — ${u.role.permissions.length} perms from role ${u.role.name}`)
    updated++
  }
  console.log(`\ndone — ${updated} user(s) backfilled, ${skipped} skipped`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
