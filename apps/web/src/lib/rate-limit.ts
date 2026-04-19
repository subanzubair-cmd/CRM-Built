import { NextRequest, NextResponse } from 'next/server'

const rateLimit = new Map<string, { count: number; resetAt: number }>()

// Clean stale entries every 5 minutes to prevent memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, val] of rateLimit) {
      if (val.resetAt < now) rateLimit.delete(key)
    }
  }, 5 * 60 * 1000)
}

export function checkRateLimit(ip: string, limit = 100, windowMs = 60000): boolean {
  const now = Date.now()
  const entry = rateLimit.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= limit
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    '127.0.0.1'
  )
}

/**
 * Route-level rate limit helper: returns a 429 NextResponse if the caller
 * has exceeded the limit, otherwise null. Call at the top of mutation
 * handlers alongside requirePermission.
 *
 * `bucket` is a scope key (defaults to a shared "default" bucket). Pass a
 * unique bucket per endpoint if you want independent limits — e.g. passing
 * `'users.delete'` isolates user-delete calls from other mutations.
 */
export function rateLimitMutation(
  req: NextRequest,
  opts: { bucket?: string; limit?: number; windowMs?: number } = {},
): NextResponse | null {
  const ip = getClientIp(req.headers)
  const bucket = opts.bucket ?? 'default'
  const limit = opts.limit ?? 60
  const windowMs = opts.windowMs ?? 60_000
  const key = `${bucket}:${ip}`
  if (!checkRateLimit(key, limit, windowMs)) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429 },
    )
  }
  return null
}
