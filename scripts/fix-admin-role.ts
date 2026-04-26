/**
 * Reassign admin@homewardpartners.com to the Admin role.
 *
 * Usage: npx tsx scripts/fix-admin-role.ts
 */
import 'reflect-metadata'
import { sequelize, Role, User } from '../packages/database/src'

async function main() {
  const admin = await Role.findOne({ where: { name: 'Admin' }, raw: true }) as any
  if (!admin) {
    console.error('Admin role not found')
    process.exit(1)
  }
  const [count] = await User.update(
    { roleId: admin.id },
    { where: { email: 'admin@homewardpartners.com' } },
  )
  console.log(`Reassigned ${count} user(s) to Admin role`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => sequelize.close())
