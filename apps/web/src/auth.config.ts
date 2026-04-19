import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-safe auth config shared by middleware and the full auth handler.
 *
 * This intentionally contains NO providers and NO callbacks that touch
 * Prisma (or any Node-only module) — the middleware runs in the edge
 * runtime which can't load the full Prisma client. The `session()` callback
 * that DOES hit Prisma lives in auth.ts and is only invoked by API route
 * handlers, not by middleware.
 */
export default {
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    // Middleware uses req.auth.user — already populated from the JWT token
    // via the minimal session wiring below. No DB access.
    async session({ session, token }) {
      session.user.id = token.userId as string
      ;(session.user as any).roleId = token.roleId
      ;(session.user as any).permissions = token.permissions
      ;(session.user as any).marketIds = token.marketIds
      return session
    },
  },
} satisfies NextAuthConfig
