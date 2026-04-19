/**
 * Twilio conference call helpers
 *
 * Manages outbound conference calls, supervisor coaching (whisper/barge),
 * and call termination via Twilio REST API.
 *
 * Falls back to mock mode when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are absent.
 */

import twilio from 'twilio'
import { getActiveCommConfig } from './comm-provider'

/**
 * Resolve Twilio credentials from the active CommProviderConfig.
 * Falls back to env vars via the resolver's internal fallback.
 */
async function getClient() {
  const config = await getActiveCommConfig()
  if (!config || config.providerName !== 'twilio') return null
  if (!config.accountSid || !config.authToken) return null
  return twilio(config.accountSid, config.authToken)
}

async function getDefaultNumber(): Promise<string> {
  const config = await getActiveCommConfig()
  return config?.defaultNumber ?? ''
}

async function getTwimlHost(): Promise<string> {
  const config = await getActiveCommConfig()
  return config?.twimlHost ?? 'http://localhost:3000'
}

/**
 * Generate a URL-safe unique conference room name.
 */
export function generateConferenceName(): string {
  return `conf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Build the TwiML URL for a conference leg.
 * Twilio calls this URL when the dialed party answers.
 */
export async function buildTwimlUrl(conferenceName: string): Promise<string> {
  const host = await getTwimlHost()
  return `${host}/api/calls/twiml?conference=${encodeURIComponent(conferenceName)}`
}

/**
 * Build the status callback URL for Twilio to report call status changes.
 */
export async function buildStatusCallbackUrl(): Promise<string> {
  const host = await getTwimlHost()
  return `${host}/api/webhooks/twilio-call`
}

/**
 * Dial both the agent and the customer into a named conference.
 * Returns the Twilio Call SIDs for both legs.
 *
 * @param agentPhone      Agent's E.164 phone number (from User.phone)
 * @param customerPhone   Customer's E.164 phone number
 * @param conferenceName  Unique conference room name
 */
export async function makeConferenceCall(
  agentPhone: string,
  customerPhone: string,
  conferenceName: string,
  fromNumber?: string,
): Promise<{ agentCallSid: string; customerCallSid: string }> {
  const client = await getClient()
  const twimlUrl = await buildTwimlUrl(conferenceName)
  const statusCallbackUrl = await buildStatusCallbackUrl()
  const callerNumber = fromNumber ?? (await getDefaultNumber())

  if (!client) {
    console.log(`[twilio-calls] MOCK conference "${conferenceName}": agent=${agentPhone} customer=${customerPhone}`)
    return {
      agentCallSid: `mock-agent-${Date.now()}`,
      customerCallSid: `mock-customer-${Date.now()}`,
    }
  }

  // Dial both legs in parallel
  const [agentCall, customerCall] = await Promise.all([
    client.calls.create({
      to: agentPhone,
      from: callerNumber,
      url: twimlUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    }),
    client.calls.create({
      to: customerPhone,
      from: callerNumber,
      url: twimlUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    }),
  ])

  return {
    agentCallSid: agentCall.sid,
    customerCallSid: customerCall.sid,
  }
}

/**
 * Add a supervisor to an existing conference in WHISPER mode.
 * The supervisor can hear and speak to the agent; the customer cannot hear the supervisor.
 *
 * @param conferenceSid  Twilio Conference SID (CF…)
 * @param supervisorPhone  Supervisor's E.164 phone number
 * @param agentCallSid   Call SID of the agent's leg (required for coaching)
 * @returns Supervisor's Call SID
 */
export async function addWhisperParticipant(
  conferenceSid: string,
  supervisorPhone: string,
  agentCallSid: string,
): Promise<string> {
  const client = await getClient()

  if (!client) {
    console.log(`[twilio-calls] MOCK whisper: supervisor=${supervisorPhone} coaching agent=${agentCallSid}`)
    return `mock-supervisor-${Date.now()}`
  }

  const participant = await client.conferences(conferenceSid).participants.create({
    to: supervisorPhone,
    from: await getDefaultNumber(),
    coaching: true,
    callSidToCoach: agentCallSid,
    beep: 'false',
  } as any)

  return participant.callSid
}

/**
 * Add a supervisor to an existing conference in BARGE mode.
 * All three parties (agent, customer, supervisor) hear each other.
 *
 * @param conferenceSid  Twilio Conference SID (CF…)
 * @param supervisorPhone  Supervisor's E.164 phone number
 * @returns Supervisor's Call SID
 */
export async function addBargeParticipant(
  conferenceSid: string,
  supervisorPhone: string,
): Promise<string> {
  const client = await getClient()

  if (!client) {
    console.log(`[twilio-calls] MOCK barge: supervisor=${supervisorPhone} in conf=${conferenceSid}`)
    return `mock-supervisor-barge-${Date.now()}`
  }

  const participant = await client.conferences(conferenceSid).participants.create({
    to: supervisorPhone,
    from: await getDefaultNumber(),
    beep: 'false',
  })

  return participant.callSid
}

/**
 * Hang up a call by SID.
 */
export async function hangupCall(callSid: string): Promise<void> {
  const client = await getClient()

  if (!client) {
    console.log(`[twilio-calls] MOCK hangup: callSid=${callSid}`)
    return
  }

  await client.calls(callSid).update({ status: 'completed' })
}
