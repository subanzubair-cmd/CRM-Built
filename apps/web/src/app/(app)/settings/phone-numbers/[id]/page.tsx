import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, MessageSquare, PhoneCall, ExternalLink, Calendar,
  CheckCircle2, AlertCircle, Inbox,
} from 'lucide-react'
import {
  TwilioNumber,
  Message,
  ActiveCall,
  Property,
  Contact,
  LeadCampaign,
  Op,
} from '@crm/database'

type Params = { params: Promise<{ id: string }> }

export const metadata = { title: 'Phone Number Detail' }

function formatNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (raw.startsWith('+1') && digits.length === 11) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const PROVIDER_BADGE: Record<string, string> = {
  twilio: 'bg-red-50 text-red-700',
  telnyx: 'bg-blue-50 text-blue-700',
  signalhouse: 'bg-emerald-50 text-emerald-700',
}

export default async function PhoneNumberDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const numberRow = await TwilioNumber.findByPk(id, { raw: true }) as any
  if (!numberRow) notFound()
  const e164 = numberRow.number as string

  const linkedCampaignRow = await LeadCampaign.findOne({
    where: { phoneNumberId: id },
    attributes: ['id', 'name', 'type', 'isActive'],
    raw: true,
  }) as any

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [messages, calls, smsCount30d, callsCount30d] = await Promise.all([
    Message.findAll({
      where: { [Op.or]: [{ from: e164 }, { to: e164 }] },
      include: [
        { model: Property, as: 'property', attributes: ['id', 'streetAddress', 'city', 'state'] },
        { model: Contact, as: 'contact', attributes: ['id', 'firstName', 'lastName', 'phone'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 50,
    }),
    linkedCampaignRow
      ? ActiveCall.findAll({
          where: { leadCampaignId: linkedCampaignRow.id },
          include: [
            { model: Property, as: 'property', attributes: ['id', 'streetAddress', 'city', 'state'] },
          ],
          order: [['startedAt', 'DESC']],
          limit: 50,
        })
      : Promise.resolve([] as any[]),
    Message.count({
      where: {
        [Op.or]: [{ from: e164 }, { to: e164 }],
        channel: 'SMS',
        createdAt: { [Op.gte]: since },
      } as any,
    }),
    linkedCampaignRow
      ? ActiveCall.count({
          where: {
            leadCampaignId: linkedCampaignRow.id,
            startedAt: { [Op.gte]: since },
          } as any,
        })
      : Promise.resolve(0),
  ])

  const messagesPlain = messages.map((m) => m.get({ plain: true }) as any)
  const callsPlain = (calls as any[]).map((c) => c.get ? c.get({ plain: true }) : c) as any[]

  return (
    <div className="max-w-6xl">
      <Link
        href="/settings?tab=phone-numbers"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Phone Numbers
      </Link>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-1">
              <Phone className="w-5 h-5 text-gray-400" />
              <h1 className="text-2xl font-bold font-mono text-gray-900">{formatNumber(e164)}</h1>
              {numberRow.providerName && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${
                    PROVIDER_BADGE[numberRow.providerName] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {numberRow.providerName}
                </span>
              )}
            </div>
            {numberRow.friendlyName && (
              <p className="text-sm text-gray-500 ml-8">{numberRow.friendlyName}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!numberRow.isActive ? (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 inline-flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                Inactive
              </span>
            ) : linkedCampaignRow ? (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                Assigned
              </span>
            ) : (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 inline-flex items-center gap-1.5">
                <Inbox className="w-3 h-3" />
                Unassigned
              </span>
            )}
          </div>
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-gray-100 text-xs">
          <Field label="Lead Campaign">
            {linkedCampaignRow ? (
              <Link
                href={`/settings?tab=phone-numbers`}
                className="text-blue-600 hover:underline font-medium"
              >
                {linkedCampaignRow.name}
              </Link>
            ) : (
              <span className="text-gray-400">Unassigned</span>
            )}
          </Field>
          <Field label="Purpose">
            <span className="text-gray-700 capitalize">{numberRow.purpose}</span>
          </Field>
          <Field label="10DLC Status">
            <span className="text-gray-700">{numberRow.tenDlcStatus ?? '—'}</span>
          </Field>
          <Field label="Spam Status">
            <span className="text-gray-700">{numberRow.spamStatus ?? '—'}</span>
          </Field>
          <Field label="Provider SID">
            <span className="text-gray-500 font-mono text-[10px]">{numberRow.providerSid ?? '—'}</span>
          </Field>
          <Field label="Last Synced">
            <span className="text-gray-700">{formatDateTime(numberRow.lastSyncedAt)}</span>
          </Field>
          <Field label="Speed-to-Lead">
            <span className="text-gray-700">{numberRow.speedToLead ? 'Yes' : 'No'}</span>
          </Field>
          <Field label="Created">
            <span className="text-gray-700">{formatDateTime(numberRow.createdAt)}</span>
          </Field>
        </div>
      </div>

      {/* 30-day activity counts */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">SMS — last 30 days</h2>
          </div>
          <p className="text-3xl font-bold text-gray-900">{smsCount30d}</p>
          <p className="text-xs text-gray-500 mt-1">total messages on this number</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <PhoneCall className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-gray-800">Calls — last 30 days</h2>
          </div>
          <p className="text-3xl font-bold text-gray-900">{callsCount30d}</p>
          <p className="text-xs text-gray-500 mt-1">via assigned Lead Campaign</p>
        </div>
      </div>

      {/* Messages feed */}
      <div className="bg-white border border-gray-200 rounded-xl mb-4">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Recent Messages</h2>
          <span className="text-xs text-gray-400">last 50</span>
        </div>
        {messagesPlain.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            No messages on this number yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {messagesPlain.map((m: any) => {
              const isOutbound = m.direction === 'OUTBOUND'
              const counterparty = isOutbound ? m.to : m.from
              const contactName = m.contact
                ? `${m.contact.firstName ?? ''} ${m.contact.lastName ?? ''}`.trim()
                : null
              return (
                <li key={m.id} className="px-5 py-3 flex items-start gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      isOutbound ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {isOutbound ? '↑' : '↓'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-sm">
                        <span className="font-semibold text-gray-800">
                          {contactName || counterparty || 'Unknown'}
                        </span>
                        <span className="text-gray-400 font-mono text-xs ml-2">{counterparty}</span>
                        {m.channel && m.channel !== 'SMS' && (
                          <span className="text-[10px] uppercase tracking-wide ml-2 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {m.channel}
                          </span>
                        )}
                      </p>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">{formatDateTime(m.createdAt)}</span>
                    </div>
                    {m.body && (
                      <p className="text-sm text-gray-700 leading-snug truncate">{m.body}</p>
                    )}
                    {m.property && (
                      <Link
                        href={`/leads/dts/${m.property.id}`}
                        className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5"
                      >
                        {m.property.streetAddress}, {m.property.city}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Calls feed */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Recent Calls</h2>
          <span className="text-xs text-gray-400">last 50</span>
        </div>
        {callsPlain.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            {linkedCampaignRow
              ? 'No calls on the assigned campaign yet.'
              : 'Calls are tracked via campaign assignment — assign this number to a campaign to see call activity.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {callsPlain.map((c: any) => (
              <li key={c.id} className="px-5 py-3 flex items-start gap-3">
                <PhoneCall className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-gray-800 font-mono">{c.customerPhone}</p>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDateTime(c.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded uppercase tracking-wide font-semibold ${
                      c.status === 'COMPLETED' ? 'bg-gray-100 text-gray-600'
                      : c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                    }`}>
                      {c.status}
                    </span>
                    {c.cost != null && (
                      <span className="text-emerald-700 font-mono font-semibold tabular-nums" title="Per-call cost reported by provider">
                        ${Number(c.cost).toFixed(4)}
                        {c.costCurrency && c.costCurrency !== 'USD' && (
                          <span className="text-gray-500 font-normal ml-0.5">{c.costCurrency}</span>
                        )}
                      </span>
                    )}
                    {c.property && (
                      <Link
                        href={`/leads/dts/${c.property.id}`}
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        {c.property.streetAddress}, {c.property.city}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      {children}
    </div>
  )
}
