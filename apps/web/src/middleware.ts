import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import authConfig from './auth.config'

// Use the edge-safe config ONLY for middleware. The full auth.ts (which
// imports Prisma) cannot run in the Next.js edge runtime.
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthRoute = req.nextUrl.pathname.startsWith('/login')
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')

  // Webhooks (Twilio, Telnyx, etc.) authenticate via signed payloads
  // verified inside the route handler — they must NOT require a session.
  // Without this bypass, every provider POST gets redirected to /login.
  const isWebhook = req.nextUrl.pathname.startsWith('/api/webhooks')

  if (isApiAuth || isWebhook) return NextResponse.next()
  if (!isLoggedIn && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
