import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  getBuyerList,
  getBuyerDashboardStats,
  getTopBuyers,
  getRecentBuyerMessages,
  getBuyerBlasts,
} from '@/lib/buyers'
import { BuyerTable } from '@/components/buyers/BuyerTable'
import { BuyersHeader } from '@/components/buyers/BuyersHeader'
import { BuyersPageLayout } from '@/components/buyers/BuyersPageLayout'
import { ImportLogClient } from '@/components/buyers/ImportLogClient'
import { InactiveBuyersTable } from '@/components/buyers/InactiveBuyersTable'
import { Users, Mail, Phone, Handshake, UserCheck, Trophy, MessageSquare, Megaphone } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ tab?: string; search?: string; page?: string }>
}

export const metadata = { title: 'Buyers' }

export default async function BuyersPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const tab = sp.tab ?? 'dashboard'

  return (
    <BuyersPageLayout tab={tab}>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'contacts' && <ContactsTab searchParams={sp} session={session} />}
      {tab === 'inactive' && <InactiveTab searchParams={sp} />}
      {tab === 'inbox' && <InboxTab />}
      {tab === 'sms-campaign' && <SmsCampaignTab />}
      {tab === 'import-log' && <ImportLogClient />}
    </BuyersPageLayout>
  )
}

/* ─── Dashboard Tab ──────────────────────────────────────────────────────── */

async function DashboardTab() {
  const [stats, topBuyers] = await Promise.all([
    getBuyerDashboardStats(),
    getTopBuyers(5),
  ])

  const emailPct = stats.totalContacts > 0 ? Math.round((stats.withEmail / stats.totalContacts) * 100) : 0
  const phonePct = stats.totalContacts > 0 ? Math.round((stats.withPhone / stats.totalContacts) * 100) : 0
  const dealsPct = stats.totalContacts > 0 ? Math.round((stats.withDeals / stats.totalContacts) * 100) : 0
  const buyerPct = stats.totalContacts > 0 ? Math.round((stats.totalBuyers / stats.totalContacts) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Total Contacts */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Contacts</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalContacts}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span>{stats.totalBuyers} buyers</span>
            <span>{stats.totalAgents} agents</span>
          </div>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${buyerPct}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{buyerPct}% buyers</p>
        </div>

        {/* Contacts with Email */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-gray-500 uppercase tracking-wide">Contacts with Email</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.withEmail}</p>
          <p className="text-xs text-gray-400 mt-0.5">{stats.withEmail} / {stats.totalContacts}</p>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${emailPct}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{emailPct}%</p>
        </div>

        {/* Contacts with Phone */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-emerald-500" />
            <p className="text-xs text-gray-500 uppercase tracking-wide">Contacts with Phone</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.withPhone}</p>
          <p className="text-xs text-gray-400 mt-0.5">{stats.withPhone} / {stats.totalContacts}</p>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${phonePct}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{phonePct}%</p>
        </div>

        {/* Contacts with Deals */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Handshake className="w-4 h-4 text-amber-500" />
            <p className="text-xs text-gray-500 uppercase tracking-wide">Contacts with Deals</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.withDeals}</p>
          <p className="text-xs text-gray-400 mt-0.5">{stats.withDeals} / {stats.totalContacts}</p>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-2 bg-amber-500 rounded-full" style={{ width: `${dealsPct}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{dealsPct}%</p>
        </div>

        {/* Active Buyers */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-4 h-4 text-green-600" />
            <p className="text-xs text-gray-500 uppercase tracking-wide">Active Buyers</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.activeBuyers}</p>
          <p className="text-xs text-gray-400 mt-0.5">Currently active buyer profiles</p>
        </div>

        {/* Top Buyers */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <p className="text-xs text-gray-500 uppercase tracking-wide">Top 5 Buyers</p>
          </div>
          {topBuyers.length === 0 ? (
            <p className="text-sm text-gray-400 mt-2">No deals yet</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {topBuyers.map((b, i) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">
                    <span className="text-gray-400 mr-1.5">{i + 1}.</span>
                    {b.name}
                  </span>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-gray-500 text-xs">{b.dealsCount} deals</span>
                    <span className="font-medium text-gray-900 text-xs">
                      ${b.totalOfferAmount.toLocaleString()}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Contacts Tab ───────────────────────────────────────────────────────── */

async function ContactsTab({
  searchParams,
  session,
}: {
  searchParams: { search?: string; page?: string }
  session: any
}) {
  const { rows, total } = await getBuyerList({
    search: searchParams.search,
    page: searchParams.page ? parseInt(searchParams.page) : 1,
  })

  return (
    <div>
      <BuyersHeader />
      <BuyerTable rows={rows as any} total={total} />
    </div>
  )
}

/* ─── Inactive Tab ───────────────────────────────────────────────────────── */

async function InactiveTab({
  searchParams,
}: {
  searchParams: { search?: string; page?: string }
}) {
  const { rows, total } = await getBuyerList({
    activeOnly: false,
    search: searchParams.search,
    page: searchParams.page ? parseInt(searchParams.page) : 1,
  })
  // Only show inactive buyers.
  const inactive = rows.filter((r: any) => !r.isActive)
  return <InactiveBuyersTable rows={inactive as any} total={inactive.length} />
}

/* ─── Inbox Tab ──────────────────────────────────────────────────────────── */

async function InboxTab() {
  const messages = await getRecentBuyerMessages(20)

  if (messages.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48">
        <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">No messages from buyers yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="text-[11px] text-gray-400 px-4 py-2 border-b border-gray-100">
        {messages.length} recent message{messages.length !== 1 ? 's' : ''}
      </div>
      <div className="divide-y divide-gray-50">
        {messages.map((m) => (
          <Link
            key={m.id}
            href={m.buyerId ? `/buyers/${m.buyerId}` : '#'}
            className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
              {m.buyerName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{m.buyerName || 'Unknown'}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  m.direction === 'INBOUND'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {m.direction === 'INBOUND' ? 'Received' : 'Sent'}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400">
                  {m.channel}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {m.body ? (m.body.length > 80 ? m.body.slice(0, 80) + '...' : m.body) : '(no body)'}
              </p>
            </div>
            <div className="flex-shrink-0 text-[11px] text-gray-400">
              {new Date(m.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ─── SMS Campaign Tab ───────────────────────────────────────────────────── */

async function SmsCampaignTab() {
  const blasts = await getBuyerBlasts()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Bulk SMS blasts targeting buyer contacts
        </p>
        <p className="text-[11px] text-gray-400 italic">
          Use the contacts tab&apos;s Send Bulk SMS button to create a new blast.
        </p>
      </div>

      {blasts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48">
          <Megaphone className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No SMS blasts yet</p>
          <p className="text-xs text-gray-300 mt-1">
            Filter buyers in the Contacts tab and use Send Bulk SMS to fire your first blast.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-2.5">Campaign</th>
                <th className="text-left px-4 py-2.5">Date Sent</th>
                <th className="text-left px-4 py-2.5">Message</th>
                <th className="text-center px-3 py-2.5">Recipients</th>
                <th className="text-center px-3 py-2.5">Sent</th>
                <th className="text-center px-3 py-2.5">Delivered</th>
                <th className="text-center px-3 py-2.5">Not Delivered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {blasts.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/buyers/sms-campaigns/${b.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-[12px] whitespace-nowrap">
                    {new Date(b.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[280px]">
                    <span className="line-clamp-1">{b.body}</span>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-700">
                    {b.recipientCount}
                  </td>
                  <td className="px-3 py-3 text-center text-gray-700">
                    {b.sentCount}
                  </td>
                  <td className="px-3 py-3 text-center text-emerald-600 font-medium">
                    {b.deliveredCount}
                  </td>
                  <td className="px-3 py-3 text-center text-rose-600 font-medium">
                    {b.failedCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
