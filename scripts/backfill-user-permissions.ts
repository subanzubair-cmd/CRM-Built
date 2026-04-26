/**
 * Copy Role.permissions → User.permissions for any user whose user.permissions
 * is empty. Run after the auth.ts change that removed the role-fallback at
 * sign-in time. Idempotent: users with non-empty permissions are skipped.
 *
 * Bumps sessionVersion on each backfilled user so their next JWT revalidation
 * picks up the new permissions without waiting for token expiry.
 *
 * Usage: npx tsx scripts/backfill-user-permissions.ts
 */
import 'reflect-metadata'
import { sequelize, User, Role, literal } from '../packages/database/src'

async function main() {
  const userRows = await User.findAll({
    attributes: ['id', 'email', 'permissions'],
    include: [{ model: Role, as: 'role', attributes: ['name', 'permissions'] }],
  })
  const users = userRows.map((u) => u.get({ plain: true }) as any)

  let updated = 0
  let skipped = 0
  for (const u of users) {
    if ((u.permissions ?? []).length > 0) {
      skipped++
      continue
    }
    if (!u.role?.permissions?.length) {
      console.log(`[skip] ${u.email} — role has no permissions either`)
      skipped++
      continue
    }
    await User.update(
      {
        permissions: u.role.permissions,
        sessionVersion: literal('"sessionVersion" + 1') as any,
      } as any,
      { where: { id: u.id } },
    )
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
    await sequelize.close()
  })
