import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// Mock env before importing middleware
vi.stubEnv('AUTH_SECRET', 'test-secret-32-chars-minimum-len')

import { requireAuth, requirePermission } from '../auth'
import type { JwtPayload, Permission } from '@crm/shared'

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request
}

function makeRes(): { res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn()
  const status = vi.fn().mockReturnThis()
  const res = { status, json } as unknown as Response
  return { res, json, status }
}

const validPayload: JwtPayload = {
  userId: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  roleId: 'role-1',
  permissions: ['leads.view', 'leads.create'],
  marketIds: ['market-1'],
}

describe('requireAuth middleware', () => {
  it('calls next() when Authorization header has valid Bearer token', () => {
    const token = jwt.sign(validPayload, 'test-secret-32-chars-minimum-len')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const { res } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect((req as any).user).toMatchObject({ userId: 'user-1' })
  })

  it('returns 401 when no token provided', () => {
    const req = makeReq()
    const { res, status, json } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when token is invalid', () => {
    const req = makeReq({ headers: { authorization: 'Bearer bad.token.here' } })
    const { res, status, json } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: 'Invalid token' })
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requirePermission middleware', () => {
  it('calls next() when user has the required permission', () => {
    const token = jwt.sign(validPayload, 'test-secret-32-chars-minimum-len')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const { res } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)
    next.mockClear()

    const permMiddleware = requirePermission('leads.view' as Permission)
    permMiddleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 403 when user lacks the required permission', () => {
    const token = jwt.sign(validPayload, 'test-secret-32-chars-minimum-len')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const { res } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)
    next.mockClear()

    const { res: res2, status: status2, json: json2 } = makeRes()
    const permMiddleware = requirePermission('admin.all' as Permission)
    permMiddleware(req, res2, next)

    expect(status2).toHaveBeenCalledWith(403)
    expect(json2).toHaveBeenCalledWith({ error: 'Forbidden' })
  })

  it('calls next() when user has admin.all permission', () => {
    const adminPayload: JwtPayload = { ...validPayload, permissions: ['admin.all'] }
    const token = jwt.sign(adminPayload, 'test-secret-32-chars-minimum-len')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const { res } = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)
    next.mockClear()

    const permMiddleware = requirePermission('leads.delete' as Permission)
    permMiddleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })
})
