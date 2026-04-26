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
 *
 * Usage: npx tsx scripts/reset-session-versions.ts
 */
import 'reflect-metadata'
import { sequelize, User, Op } from '../packages/database/src'

async function main() {
  const [count] = await User.update(
    { sessionVersion: 0 } as any,
    { where: { sessionVersion: { [Op.ne]: 0 } } },
  )
  console.log(`[reset-session-versions] ${count} user(s) reset to sessionVersion=0`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await sequelize.close()
  })
