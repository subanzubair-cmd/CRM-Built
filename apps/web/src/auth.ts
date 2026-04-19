import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import type { Permission } from '@crm/shared'
import { prisma } from '@/lib/prisma'
import authConfig from './auth.config'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || user.status !== 'ACTIVE') return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        )
        if (!valid) return null

        // Permissions are per-user (decoupled from role). User.permissions[]
        // is the sole source of truth — no role fallback.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roleId: user.roleId,
          permissions: user.permissions as Permission[],
          marketIds: user.marketIds,
          sessionVersion: user.sessionVersion,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        // Sign-in: bake permissions + marketIds + sessionVersion into the token.
        // Stamp refreshedAt = now so subsequent requests don't immediately
        // hit the DB — the data was just fetched by authorize().
        token.userId = user.id
        token.roleId = (user as any).roleId
        token.permissions = (user as any).permissions
        token.marketIds = (user as any).marketIds
        token.sessionVersion = (user as any).sessionVersion ?? 0
        token.refreshedAt = Date.now()
        return token
      }

      // On client-initiated update (useSession().update()) OR every ~15 min
      // revalidate the token against the DB. 15 min balances permission
      // propagation latency against per-request DB load for long sessions.
      const last = (token.refreshedAt as number | undefined) ?? 0
      const now = Date.now()
      const shouldRefresh = trigger === 'update' || now - last > 15 * 60 * 1000
      if (!shouldRefresh) return token

      const dbUser = await prisma.user.findUnique({
        where: { id: token.userId as string },
        select: {
          sessionVersion: true,
          permissions: true,
          marketIds: true,
          status: true,
          roleId: true,
        },
      })
      const tokenVersion = (token.sessionVersion as number | undefined) ?? 0
      if (
        !dbUser ||
        dbUser.status !== 'ACTIVE' ||
        dbUser.sessionVersion !== tokenVersion
      ) {
        // Revoked — neuter the token so permission checks fail
        token.permissions = []
        token.marketIds = []
        token.roleId = null
        token.revoked = true
      } else {
        token.permissions = dbUser.permissions
        token.marketIds = dbUser.marketIds
        token.roleId = dbUser.roleId
        token.revoked = false
      }
      token.refreshedAt = now
      return token
    },
    // Reuse the edge-safe session() from auth.config — it just copies token → session
    ...authConfig.callbacks,
  },
})
