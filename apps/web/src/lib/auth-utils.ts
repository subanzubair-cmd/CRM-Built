/**
 * RBAC permission helpers
 *
 * Call `requirePermission(session, 'permission.name')` at the top of any
 * sensitive Next.js route handler. Returns a 403 NextResponse if the check
 * fails, or null if the user is authorised.
 *
 * Checks:
 *   1. `admin.all` — grants every permission
 *   2. The specific permission string must be in session.user.permissions
 *
 * Usage:
 *   const deny = requirePermission(session, 'leads.create')
 *   if (deny) return deny
 */

import type { Session } from 'next-auth'
import { NextResponse } from 'next/server'
import type { Permission } from '@crm/shared'

type SessionUser = Session['user'] & {
  permissions?: Permission[]
  marketIds?: string[]
  id?: string
}

/**
 * Returns a 403 NextResponse if the user lacks the permission, otherwise null.
 */
export function requirePermission(
  session: Session | null,
  permission: Permission,
): NextResponse | null {
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const permissions: Permission[] = user.permissions ?? []

  if (permissions.includes('admin.all') || permissions.includes(permission)) {
    return null // authorised
  }

  return NextResponse.json(
    { error: 'Forbidden', required: permission },
    { status: 403 },
  )
}

/**
 * Returns true if the user has the given permission (or admin.all).
 * Useful for conditional UI rendering in server components.
 */
export function hasPermission(session: Session | null, permission: Permission): boolean {
  if (!session?.user) return false
  const user = session.user as SessionUser
  const permissions: Permission[] = user.permissions ?? []
  return permissions.includes('admin.all') || permissions.includes(permission)
}

/**
 * Returns the user's marketIds from the session, or null if admin.all.
 * Use to scope DB queries to the user's assigned markets.
 *
 * Returns null when the user is admin (no market filter needed).
 * Returns string[] (may be empty) for regular users.
 */
export function getMarketScope(session: Session | null): string[] | null {
  if (!session?.user) return []
  const user = session.user as SessionUser
  const permissions: Permission[] = user.permissions ?? []

  if (permissions.includes('admin.all')) return null // no filter

  return user.marketIds ?? []
}

/**
 * Build a Prisma `where` fragment that scopes to the user's markets.
 *
 * - Admin → empty object (no-op)
 * - User with marketIds → { marketId: { in: [...] } }
 * - User with no markets → impossible filter (returns no rows)
 *
 * Pass the column name if the model uses something other than `marketId`
 * (e.g. `property: { marketId: { in: [...] } }` for nested queries).
 */
export function buildMarketWhere(
  session: Session | null,
  column: string = 'marketId',
): Record<string, unknown> {
  const scope = getMarketScope(session)
  if (scope === null) return {}
  if (scope.length === 0) return { [column]: { in: ['__NO_MARKET__'] } }
  return { [column]: { in: scope } }
}
