import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Users, Phone, PhoneCall, Plug, Zap, GitBranch, FileText, Tag, List, ArrowLeft, Globe2,
} from 'lucide-react'
import { getUserList, getRoleList, getCampaignListSimple, getLeadCampaignListSimple } from '@/lib/settings'
import { AutomationsPanel } from '@/components/settings/AutomationsPanel'
import { StatusAutomationsPanel } from '@/components/settings/StatusAutomationsPanel'
import { TemplatesPanel } from '@/components/settings/TemplatesPanel'
import { UsersList } from '@/components/settings/UsersList'
import { TagsPanel } from '@/components/settings/TagsPanel'
import { CommProviderForm } from '@/components/settings/CommProviderForm'
import { LeadSourcesPanel } from '@/components/settings/LeadSourcesPanel'
import { PhoneNumbersPanel } from '@/components/settings/PhoneNumbersPanel'
import { GeneralSettingsPanel } from '@/components/settings/GeneralSettingsPanel'
import { hasPermission } from '@/lib/auth-utils'

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

/* ------------------------------------------------------------------ */
/*  Grid card configuration — REsimpli-style landing page              */
/* ------------------------------------------------------------------ */

type CardIcon = typeof Users

interface SettingCard {
  key: string
  title: string
  description: string
  icon: CardIcon
  label: string
}

interface SettingSection {
  label: string
  cards: SettingCard[]
}

const SETTINGS_SECTIONS: SettingSection[] = [
  {
    label: 'General',
    cards: [
      { key: 'users', title: 'Manage Users', description: 'Add/Manage Users, Permissions & Profile', icon: Users, label: 'Users' },
      { key: 'general', title: 'General Settings', description: 'Company timezone — applies to every user regardless of where they’re working from', icon: Globe2, label: 'General' },
    ],
  },
  {
    label: 'Marketing',
    cards: [
      { key: 'sms-integration', title: 'SMS & Phone Number Integration', description: 'Configure your SMS & voice provider (Twilio, Telnyx, Signal House)', icon: Plug, label: 'Integration' },
      { key: 'phone-numbers', title: 'Phone Numbers', description: 'Buy / Manage phone numbers', icon: Phone, label: 'Phone Numbers' },
      { key: 'call-flow', title: 'Call Flow', description: 'Configure how incoming calls are routed', icon: PhoneCall, label: 'Call Flow' },
    ],
  },
  {
    label: 'Automation',
    cards: [
      { key: 'automations', title: 'Drip Campaigns', description: 'Add/Manage drip campaign automations', icon: Zap, label: 'Automations' },
      { key: 'status-automations', title: 'Status Automations', description: 'Manage tasks, drips, and stage triggers', icon: GitBranch, label: 'Status Automations' },
    ],
  },
  {
    label: 'Customization',
    cards: [
      { key: 'templates', title: 'Manage Templates', description: 'SMS, Email, RVM, Task templates', icon: FileText, label: 'Templates' },
      { key: 'tags', title: 'Tags', description: 'Manage tags used across leads', icon: Tag, label: 'Tags' },
      { key: 'lead-sources', title: 'Lead Sources', description: 'Manage lead sources used in campaigns', icon: List, label: 'Lead Sources' },
    ],
  },
]

/**
 * Flatten cards into a lookup for the title/label of the active tab.
 */
const CARD_BY_KEY = new Map<string, SettingCard>()
for (const sec of SETTINGS_SECTIONS) for (const c of sec.cards) CARD_BY_KEY.set(c.key, c)

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export const metadata = { title: 'Settings' }

export default async function SettingsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { tab } = await searchParams
  const currentUserId = (session.user as any).id as string

  const [users, roles, campaigns, leadCampaigns] = await Promise.all([
    getUserList(),
    getRoleList(),
    getCampaignListSimple(),
    getLeadCampaignListSimple(),
  ])

  const activeCard = tab ? CARD_BY_KEY.get(tab) : null

  // ─── Landing grid view ───
  if (!tab || !activeCard) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-sm text-gray-500 mb-6">Manage your team, automations, and system configuration</p>

        <div className="space-y-8">
          {SETTINGS_SECTIONS.map((section) => (
            <div key={section.label}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {section.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.cards.map((card) => {
                  const Icon = card.icon
                  return (
                    <Link
                      key={card.key}
                      href={`/settings?tab=${card.key}`}
                      className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-50 group-hover:bg-blue-50 flex items-center justify-center flex-shrink-0 transition-colors">
                        <Icon className="w-5 h-5 text-gray-700 group-hover:text-blue-600 transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                          {card.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          {card.description}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Detail panel view ───
  return (
    <div>
      {/* Back link + title */}
      <div className="mb-5">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Settings
        </Link>
        <h1 className="text-xl font-bold text-gray-900">{activeCard.title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{activeCard.description}</p>
      </div>

      {/* Panel content */}
      {tab === 'users' && (
        <UsersList
          users={users as any}
          roles={roles as any}
          campaigns={campaigns as any}
          leadCampaigns={leadCampaigns as any}
          currentUserId={currentUserId}
        />
      )}

      {tab === 'general' && (
        <GeneralSettingsPanel canEdit={hasPermission(session, 'settings.manage')} />
      )}

      {tab === 'sms-integration' && <CommProviderForm />}

      {tab === 'phone-numbers' && <PhoneNumbersPanel />}

      {tab === 'call-flow' && (
        <div className="max-w-3xl">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Call Flow</h3>
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
      )}

      {tab === 'automations' && <AutomationsPanel />}

      {tab === 'status-automations' && <StatusAutomationsPanel />}

      {tab === 'templates' && <TemplatesPanel />}

      {tab === 'tags' && <TagsPanel />}

      {tab === 'lead-sources' && <LeadSourcesPanel />}
    </div>
  )
}
