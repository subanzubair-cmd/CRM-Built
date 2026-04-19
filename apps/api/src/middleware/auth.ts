import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import type { JwtPayload, Permission } from '@crm/shared'

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  return null
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const secret = process.env.AUTH_SECRET
    if (!secret) throw new Error('AUTH_SECRET not configured')
    const payload = jwt.verify(token, secret) as JwtPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (
      user.permissions.includes('admin.all') ||
      user.permissions.includes(permission)
    ) {
      next()
      return
    }
    res.status(403).json({ error: 'Forbidden' })
  }
}
