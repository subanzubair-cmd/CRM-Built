import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'
import { getCompanySettings, setCompanyTimezone, setRejectMode } from '@/lib/company-settings'

/**
 * /api/settings/general — CRM-wide General Settings (singleton row).
 *
 * GET   any signed-in user — needed because every page that displays
 *       a date queries this to render in the company timezone.
 * POST  admin only — writes any subset of the settings.
 *
 * Body shape (all optional, write whatever's present):
 *   { timezone?: string, rejectMode?: 'soft' | 'hard' }
 *
 * timezone   — IANA zone (e.g. 'America/Chicago')
 * rejectMode — 'soft' (CRM dismiss only) | 'hard' (true Telnyx hangup)
 */

const UpdateSchema = z
  .object({
    timezone: z
      .string()
      .min(1)
      .max(64)
      // Loose IANA-ish format check; the runtime Intl validator below
      // is the real authority but this catches obvious typos cheaply.
      .regex(/^[A-Za-z_]+\/[A-Za-z_+\-0-9]+(\/[A-Za-z_+\-0-9]+)?$|^UTC$/)
      .optional(),
    rejectMode: z.enum(['soft', 'hard']).optional(),
  })
  .refine((d) => d.timezone !== undefined || d.rejectMode !== undefined, {
    message: 'Provide at least one of: timezone, rejectMode',
  })

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const settings = await getCompanySettings()
  return NextResponse.json({ data: settings })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  // settings.manage is the existing admin-tier permission used by
  // /api/settings/comm-provider/* — same gate keeps things consistent.
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const body = await req.json().catch(() => ({}))
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  if (parsed.data.timezone !== undefined) {
    // Validate the IANA zone is actually known to the host's ICU data.
    // Throws RangeError on garbage like 'Mars/Olympus_Mons'.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: parsed.data.timezone })
    } catch {
      return NextResponse.json(
        { error: `Unknown IANA timezone: "${parsed.data.timezone}"` },
        { status: 422 },
      )
    }
    await setCompanyTimezone(parsed.data.timezone)
  }

  if (parsed.data.rejectMode !== undefined) {
    await setRejectMode(parsed.data.rejectMode)
  }

  const fresh = await getCompanySettings()
  return NextResponse.json({ ok: true, data: fresh })
}

// Keep the read open to non-admins so display formatting works for
// every user — only the write requires the admin permission.
export const dynamic = 'force-dynamic'
