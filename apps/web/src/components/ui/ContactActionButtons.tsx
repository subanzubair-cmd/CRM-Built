'use client'

/**
 * Actionable Call / SMS / Email buttons for phone numbers and emails.
 * Extracted into a client component to avoid Lucide hydration mismatches
 * when server components render SVG icons inside <a> tags.
 */

import { PhoneCall, MessageSquare, Mail } from 'lucide-react'

export function PhoneActions({ number }: { number: string }) {
  return (
    <div className="flex items-center gap-1 ml-auto">
      <a
        href={`tel:${number}`}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
        title="Call"
      >
        <PhoneCall className="w-3 h-3" />
        Call
      </a>
      <a
        href={`sms:${number}`}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        title="SMS"
      >
        <MessageSquare className="w-3 h-3" />
        SMS
      </a>
    </div>
  )
}

export function EmailActions({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-1 ml-auto">
      <a
        href={`mailto:${email}`}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
        title="Email"
      >
        <Mail className="w-3 h-3" />
        Email
      </a>
    </div>
  )
}
