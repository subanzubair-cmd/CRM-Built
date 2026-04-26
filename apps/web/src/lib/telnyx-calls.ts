/**
 * Telnyx Call Control helpers — currently just hangup, used by the
 * provider-agnostic /api/calls/[id]/hangup route and the unload-cleanup
 * beacon. Outbound origination still goes through twilio-calls for now.
 */
import { getActiveCommConfig } from './comm-provider'

/**
 * Force-hangup a Telnyx call by call_control_id.
 *
 * Telnyx Call Control: POST /v2/calls/{call_control_id}/actions/hangup
 *
 * Idempotent — Telnyx returns 200/202 for already-ended calls. Returns
 * `{ ok: false }` only on auth failure or network error so the caller
 * can decide whether to retry.
 */
export async function hangupTelnyxCall(callControlId: string): Promise<{ ok: boolean; status?: number }> {
  const config = await getActiveCommConfig()
  if (config?.providerName !== 'telnyx' || !config.apiKey) {
    return { ok: false }
  }
  try {
    const res = await fetch(
      `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/hangup`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    )
    return { ok: res.ok || res.status === 422, status: res.status }
  } catch (err) {
    console.error('[telnyx-calls] hangup failed:', err)
    return { ok: false }
  }
}
