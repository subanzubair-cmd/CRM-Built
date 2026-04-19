import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-utils'
import { getActiveCommConfig } from '@/lib/comm-provider'

/**
 * POST /api/phone-numbers/sync
 * Pulls the active provider's number list and upserts into TwilioNumber.
 */
export async function POST() {
  const session = await auth()
  const deny = requirePermission(session, 'settings.manage')
  if (deny) return deny

  const config = await getActiveCommConfig()

  if (!config) {
    return NextResponse.json(
      { success: false, error: 'No active provider' },
      { status: 400 },
    )
  }

  const now = new Date()

  try {
    // ── Twilio ────────────────────────────────────────────────────────────
    if (config.providerName === 'twilio') {
      if (!config.accountSid || !config.authToken) {
        return NextResponse.json(
          { success: false, error: 'Twilio credentials missing' },
          { status: 400 },
        )
      }

      const basicAuth = Buffer.from(
        `${config.accountSid}:${config.authToken}`,
      ).toString('base64')

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/IncomingPhoneNumbers.json`,
        { headers: { Authorization: `Basic ${basicAuth}` } },
      )

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return NextResponse.json(
          {
            success: false,
            error: `Twilio API ${res.status}: ${text.slice(0, 200)}`,
          },
          { status: 502 },
        )
      }

      const body = (await res.json()) as {
        incoming_phone_numbers?: Array<{
          phone_number?: string
          friendly_name?: string
          sid?: string
        }>
      }
      const numbers = body.incoming_phone_numbers ?? []
      let count = 0

      for (const n of numbers) {
        if (!n.phone_number) continue
        await prisma.twilioNumber.upsert({
          where: { number: n.phone_number },
          create: {
            number: n.phone_number,
            friendlyName: n.friendly_name ?? null,
            providerName: 'twilio',
            providerSid: n.sid ?? null,
            lastSyncedAt: now,
          },
          update: {
            friendlyName: n.friendly_name ?? null,
            providerSid: n.sid ?? null,
            lastSyncedAt: now,
          },
        })
        count++
      }

      return NextResponse.json({
        success: true,
        count,
        providerName: 'twilio',
      })
    }

    // ── Telnyx ────────────────────────────────────────────────────────────
    if (config.providerName === 'telnyx') {
      if (!config.apiKey) {
        return NextResponse.json(
          { success: false, error: 'Telnyx API key missing' },
          { status: 400 },
        )
      }

      const res = await fetch('https://api.telnyx.com/v2/phone_numbers', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return NextResponse.json(
          {
            success: false,
            error: `Telnyx API ${res.status}: ${text.slice(0, 200)}`,
          },
          { status: 502 },
        )
      }

      const body = (await res.json()) as {
        data?: Array<{
          phone_number?: string
          id?: string
        }>
      }
      const numbers = body.data ?? []
      let count = 0

      for (const n of numbers) {
        if (!n.phone_number) continue
        await prisma.twilioNumber.upsert({
          where: { number: n.phone_number },
          create: {
            number: n.phone_number,
            friendlyName: n.phone_number,
            providerName: 'telnyx',
            providerSid: n.id ?? null,
            lastSyncedAt: now,
          },
          update: {
            friendlyName: n.phone_number,
            providerSid: n.id ?? null,
            lastSyncedAt: now,
          },
        })
        count++
      }

      return NextResponse.json({
        success: true,
        count,
        providerName: 'telnyx',
      })
    }

    // ── Signal House ──────────────────────────────────────────────────────
    if (config.providerName === 'signalhouse') {
      return NextResponse.json({
        success: true,
        count: 0,
        providerName: 'signalhouse',
        note: 'not implemented',
      })
    }

    return NextResponse.json(
      { success: false, error: `Unknown provider: ${config.providerName}` },
      { status: 400 },
    )
  } catch (err: any) {
    console.error('[phone-numbers/sync] provider error:', err)
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Provider sync failed' },
      { status: 502 },
    )
  }
}
