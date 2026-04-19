import { NextRequest, NextResponse } from 'next/server'

/**
 * GET/POST /api/calls/twiml?conference=<name>
 *
 * Called by Twilio when a dialed party answers.
 * Returns TwiML that joins the caller to the named conference.
 *
 * No auth required — Twilio calls this directly.
 * The conferenceName is a random token (not guessable) so SSRF is not a concern.
 */
export async function GET(req: NextRequest) {
  return buildTwimlResponse(req)
}

export async function POST(req: NextRequest) {
  return buildTwimlResponse(req)
}

function buildTwimlResponse(req: NextRequest): NextResponse {
  const { searchParams } = new URL(req.url)
  const conference = searchParams.get('conference')

  if (!conference) {
    return NextResponse.json({ error: 'Missing conference param' }, { status: 400 })
  }

  // Sanitize: only allow alphanumeric, hyphens, underscores
  const safeName = conference.replace(/[^a-zA-Z0-9\-_]/g, '')

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference
      beep="false"
      startConferenceOnEnter="true"
      endConferenceOnExit="false"
      waitUrl=""
      muted="false"
    >${safeName}</Conference>
  </Dial>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
