import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  getBuyerList,
  getBuyerDashboardStats,
  getTopBuyers,
  getRecentBuyerMessages,
  getBuyerCampaigns,
} from '@/lib/buyers'
import { BuyerTable } from '@/components/buyers/BuyerTable'
import { BuyersHeader } from '@/components/buyers/BuyersHeader'
import { BuyersPageLayout } from '@/components/buyers/BuyersPageLayout'
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
      {tab === 'inbox' && <InboxTab />}
      {tab === 'sms-campaign' && <SmsCampaignTab />}
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
  const campaigns = await getBuyerCampaigns()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">SMS campaigns targeting buyer contacts</p>
        <Link
          href="/drip-campaigns"
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Megaphone className="w-3.5 h-3.5" />
          + New Drip Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48">
          <Megaphone className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No SMS campaigns yet</p>
          <p className="text-xs text-gray-300 mt-1">Create a campaign with SMS steps to see it here</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Campaign Name</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Type</th>
                <th className="text-left px-4 py-2.5">Date Created</th>
                <th className="text-left px-4 py-2.5">Recipients</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      c.status === 'ACTIVE' ? 'bg-green-50 text-green-700' :
                      c.status === 'COMPLETED' ? 'bg-blue-50 text-blue-700' :
                      c.status === 'PAUSED' ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.type}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(c.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.recipients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
