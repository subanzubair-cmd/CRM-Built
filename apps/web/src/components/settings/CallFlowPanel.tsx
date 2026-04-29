'use client'

import { PhoneCall } from 'lucide-react'

/**
 * CallFlowPanel — Settings → Call Flow.
 *
 * Reserved for the call-flow editor (business hours, IVR, multi-agent
 * ringing, etc.). The previous Soft/Hard reject toggle was removed —
 * Reject now always terminates the parent call at the provider, so
 * there's no behavior to choose between.
 */

interface Props {
  /** Whether the current user has settings.manage permission. */
  canEdit: boolean
}

export function CallFlowPanel(_props: Props) {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <PhoneCall className="w-4 h-4 text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-800">Call Flow</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Define how incoming calls are routed — business hours, IVR menus, agent queues, and
          multi-agent ringing for the WebRTC softphone.
        </p>
        <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center">
          <PhoneCall className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Call flow configuration coming soon.</p>
          <p className="text-[11px] text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
            Includes per-agent SIP credentials so inbound calls can ring multiple browsers in
            parallel — first agent to answer takes the call. Requires changes to
            <code className="mx-1 px-1 bg-gray-100 rounded">/api/calls/credentials</code>
            to mint a credential per agent (today it&rsquo;s a single shared credential).
          </p>
        </div>
      </div>
    </div>
  )
}
