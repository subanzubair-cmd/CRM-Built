/**
 * Twilio integration wrapper
 *
 * Wraps the Twilio REST client for outbound SMS and RVM.
 * Falls back gracefully to console logging when TWILIO_ACCOUNT_SID /
 * TWILIO_AUTH_TOKEN are not set (useful in dev/test environments).
 *
 * Inbound SMS is handled by the webhook route in routes/webhooks.ts.
 */

import twilio from 'twilio'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN

function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    return null
  }
  return twilio(ACCOUNT_SID, AUTH_TOKEN)
}

/**
 * Send an outbound SMS.
 * @param to   Recipient E.164 phone number (e.g. +15551234567)
 * @param from Twilio sender number (E.164)
 * @param body Message text
 * @returns Twilio message SID, or 'mock-sms-sid' in dev mode
 */
export async function sendSms(to: string, from: string, body: string): Promise<string> {
  const client = getClient()

  if (!client) {
    console.log(`[twilio] MOCK SMS → ${to}: "${body.slice(0, 60)}..."`)
    return 'mock-sms-sid'
  }

  const message = await client.messages.create({ to, from, body })
  console.log(`[twilio] SMS sent → ${to}, sid: ${message.sid}`)
  return message.sid
}

/**
 * Send an outbound RVM (ringless voicemail) via Twilio TwiML.
 * @param to       Recipient E.164 phone number
 * @param from     Twilio caller number (E.164)
 * @param audioUrl Publicly accessible URL of the voicemail audio file
 * @returns Twilio call SID, or 'mock-rvm-sid' in dev mode
 */
export async function sendRvm(to: string, from: string, audioUrl: string): Promise<string> {
  const client = getClient()

  if (!client) {
    console.log(`[twilio] MOCK RVM → ${to}: audioUrl="${audioUrl}"`)
    return 'mock-rvm-sid'
  }

  const call = await client.calls.create({
    to,
    from,
    twiml: `<Response><Play>${audioUrl}</Play><Hangup/></Response>`,
  })
  console.log(`[twilio] RVM sent → ${to}, sid: ${call.sid}`)
  return call.sid
}

/**
 * Validate an inbound Twilio webhook request signature.
 * Returns true if the signature is valid (or if in mock mode).
 */
export function validateWebhookSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    // In dev mode without credentials, accept all webhooks
    return true
  }
  return twilio.validateRequest(AUTH_TOKEN, signature, url, params)
}
