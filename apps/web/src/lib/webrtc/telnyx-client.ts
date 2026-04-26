'use client'

/**
 * TelnyxClient — singleton wrapper around the Telnyx WebRTC SDK so the
 * whole CRM browser shares one SIP registration. Lazily connects on
 * first call to ensureReady(); auto-refreshes the JWT before expiry.
 *
 * The browser fetches the short-lived login_token from
 * /api/calls/credentials (server-side mints it via the Telnyx API key),
 * never sees the API key directly.
 *
 * Events are surfaced via a small EventEmitter-style API so the
 * useTelnyxCall hook + InboundCallNotification can subscribe without
 * coupling to the SDK's internals.
 */

import { TelnyxRTC } from '@telnyx/webrtc'

type Listener<T = any> = (data: T) => void

const REMOTE_AUDIO_EL_ID = 'crm-call-remote-audio'

/**
 * Lazily create (and cache) a hidden <audio> element that the Telnyx
 * SDK attaches the remote (customer) MediaStream to. Without this,
 * the SDK negotiates the peer connection but the stream never plays
 * through speakers — the agent hears nothing.
 *
 * Cached on globalThis so HMR doesn't multiply the element across
 * dev reloads.
 */
function ensureRemoteAudioElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  const existing = document.getElementById(REMOTE_AUDIO_EL_ID) as HTMLAudioElement | null
  if (existing) return existing
  const el = document.createElement('audio')
  el.id = REMOTE_AUDIO_EL_ID
  el.autoplay = true
  ;(el as any).playsInline = true
  el.style.display = 'none'
  document.body.appendChild(el)
  return el
}

interface CredentialsResponseJwt {
  provider: 'telnyx'
  mode?: 'jwt'
  loginToken: string
  credentialId: string
  expiresAt: string | null
}
interface CredentialsResponseStatic {
  provider: 'telnyx'
  mode: 'static'
  sipUsername: string
  sipPassword: string
  expiresAt: null
}
type CredentialsResponse = CredentialsResponseJwt | CredentialsResponseStatic

export type TelnyxCallState =
  | 'new'
  | 'trying'
  | 'requesting'
  | 'recovering'
  | 'ringing'
  | 'answering'
  | 'early'
  | 'active'
  | 'held'
  | 'hangup'
  | 'destroy'
  | 'purge'

export interface TelnyxNotification {
  type: string
  call?: any
  [key: string]: unknown
}

class TelnyxClientImpl {
  private client: TelnyxRTC | null = null
  private connecting: Promise<void> | null = null
  private listeners = new Map<string, Set<Listener>>()
  private tokenExpiresAt: number | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  on(event: 'ready' | 'error' | 'invite' | 'notification', cb: Listener): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(cb)
    return () => set!.delete(cb)
  }

  private emit(event: string, data?: unknown) {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(data)
      } catch (err) {
        console.error('[telnyx-client] listener for', event, 'threw', err)
      }
    })
  }

  /**
   * Idempotent — first call connects, subsequent calls return the same
   * promise. Safe to call from many places.
   */
  async ensureReady(): Promise<TelnyxRTC> {
    if (this.client && this.client.connected) return this.client
    if (this.connecting) {
      await this.connecting
      if (this.client) return this.client
    }
    this.connecting = this.connect().finally(() => {
      this.connecting = null
    })
    await this.connecting
    if (!this.client) throw new Error('Telnyx client failed to initialize')
    return this.client
  }

  private async connect(): Promise<void> {
    const credentials = await this.fetchCredentials()

    // Pass remoteElement to the SDK so it auto-attaches the customer's
    // audio stream to a hidden <audio> tag and plays it through the
    // agent's speakers. Without this, we'd hear nothing — the SDK has
    // the stream but doesn't auto-play. Done at SDK construction so
    // it's wired BEFORE the peer connection is negotiated.
    const remoteEl = ensureRemoteAudioElement()

    // Two registration modes for the SDK:
    //   - static: pass the SIP username + password directly (operator
    //             pasted them from a Telnyx Credentials-type SIP
    //             Connection — no JWT mint round-trip).
    //   - jwt:    pass login_token; the SDK exchanges it for a session.
    const client =
      credentials.mode === 'static'
        ? new TelnyxRTC({
            login: credentials.sipUsername,
            password: credentials.sipPassword,
            // @ts-ignore — SDK accepts both the element and its ID.
            remoteElement: remoteEl ?? undefined,
          })
        : new TelnyxRTC({
            login_token: credentials.loginToken,
            // @ts-ignore
            remoteElement: remoteEl ?? undefined,
          })

    // Wire all SDK events through our pub/sub so consumers don't import
    // the Telnyx SDK directly.
    client.on('telnyx.ready', () => this.emit('ready'))
    client.on('telnyx.error', (err: unknown) => {
      console.error('[telnyx-client] SDK error:', err)
      this.emit('error', err)
    })
    client.on('telnyx.notification', (notification: TelnyxNotification) => {
      this.emit('notification', notification)
      // Inbound INVITE — emit a dedicated event so InboundCallNotification
      // can react without filtering all notifications.
      if (notification.type === 'callUpdate' && notification.call) {
        const callState = (notification.call.state ?? '').toLowerCase()
        if (callState === 'ringing' && notification.call.direction === 'inbound') {
          this.emit('invite', notification.call)
        }
      }
    })

    await client.connect()
    this.client = client

    // Schedule a refresh ~1 minute before the JWT expires so we never
    // disconnect mid-call. The credentials endpoint always returns a new
    // login_token; we tear down + reconnect transparently. Static
    // credentials don't expire so this is skipped.
    if (credentials.expiresAt) {
      const expiresMs = new Date(credentials.expiresAt).getTime()
      this.tokenExpiresAt = expiresMs
      const refreshIn = Math.max(60_000, expiresMs - Date.now() - 60_000)
      this.scheduleRefresh(refreshIn)
    }
  }

  private scheduleRefresh(delayMs: number) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(async () => {
      try {
        await this.disconnect()
        await this.ensureReady()
      } catch (err) {
        console.error('[telnyx-client] token refresh failed:', err)
      }
    }, delayMs)
  }

  private async fetchCredentials(): Promise<CredentialsResponse> {
    const res = await fetch('/api/calls/credentials')
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error ?? `Credentials request failed (${res.status})`)
    }
    return res.json()
  }

  /**
   * Place an outbound call via the connected SDK. Returns the Telnyx
   * Call instance; useCallCleanup / MediaRecorder hooks attach to it.
   */
  async newCall(toNumber: string, fromNumber: string): Promise<any> {
    const client = await this.ensureReady()
    return client.newCall({
      destinationNumber: toNumber,
      callerNumber: fromNumber,
      audio: true,
      video: false,
    })
  }

  async disconnect(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    if (this.client) {
      try {
        await this.client.disconnect()
      } catch (err) {
        console.warn('[telnyx-client] disconnect error:', err)
      }
      this.client = null
    }
    this.tokenExpiresAt = null
  }

  isConnected(): boolean {
    return !!this.client?.connected
  }
}

// Module-scoped singleton — one SIP registration per browser tab.
let instance: TelnyxClientImpl | null = null
export function getTelnyxClient(): TelnyxClientImpl {
  if (!instance) instance = new TelnyxClientImpl()
  return instance
}
