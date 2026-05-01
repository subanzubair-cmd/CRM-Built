import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { User } from '@crm/database'
import { getBuyerById } from '@/lib/buyers'
import { BuyerCriteriaCard } from '@/components/buyers/BuyerCriteriaCard'
import { BuyerMatchHistoryCard } from '@/components/buyers/BuyerMatchHistoryCard'
import { BuyerOfferHistoryCard } from '@/components/buyers/BuyerOfferHistoryCard'
import { BuyerNotesCard } from '@/components/buyers/BuyerNotesCard'
import { BuyerHeaderActions } from '@/components/buyers/BuyerHeaderActions'
import Link from 'next/link'
import { ChevronLeft, Phone, Mail, MapPin, User as UserIcon, MegaphoneIcon } from 'lucide-react'

// Buyer Preference question definitions (mirror of the form's
// DEFAULT_QUESTIONS) so the detail page can render labeled answers
// instead of raw JSON keys. Keep this in sync with BuyerFormModal's
// DEFAULT_QUESTIONS until both come from a CustomFormConfig row.
const QUESTION_DEFS: Array<{ id: string; label: string }> = [
  { id: 'kindOfProperties', label: 'Properties of interest' },
  { id: 'exitStrategies', label: 'Exit strategies' },
  { id: 'dealsAimingThisYear', label: 'Deals aiming for this year' },
  { id: 'proofOfFunds', label: 'Proof of funds' },
  { id: 'howSoonClose', label: 'How soon can close' },
  { id: 'idealPriceRange', label: 'Ideal price range' },
  { id: 'bestWayToSendDeal', label: 'Best way to send deals' },
]

function formatAnswer(v: unknown): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  return String(v)
}

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const buyer = await getBuyerById(id)
  const name = buyer?.contact
    ? [buyer.contact.firstName, buyer.contact.lastName].filter(Boolean).join(' ')
    : ''
  return { title: name || 'Buyer' }
}

export default async function BuyerDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const buyer = await getBuyerById(id)
  if (!buyer) notFound()

  const fullName = [buyer.contact.firstName, buyer.contact.lastName].filter(Boolean).join(' ')

  // Resolve the assigned user's name so the Personal Info block can
  // show "Owner: Mo Z" instead of an opaque user id. Done here in the
  // page to keep getBuyerById small + reusable.
  let assignedUserName: string | null = null
  const assignedUserId = (buyer.contact as any)?.assignedUserId
  if (assignedUserId) {
    const u = (await User.findByPk(assignedUserId, {
      attributes: ['name'],
      raw: true,
    })) as { name: string } | null
    assignedUserName = u?.name ?? null
  }

  // Read the new multi-value Contact fields with safe fallbacks.
  // Old rows (created before the migration) have empty `phones` /
  // `emails` arrays — we synthesize one entry from the legacy
  // phone / email columns so the UI never shows "no phone" for a
  // buyer that has one.
  const rawPhones = Array.isArray((buyer.contact as any).phones)
    ? ((buyer.contact as any).phones as Array<{ label: string; number: string }>)
    : []
  const rawEmails = Array.isArray((buyer.contact as any).emails)
    ? ((buyer.contact as any).emails as Array<{ label: string; email: string }>)
    : []
  const phones =
    rawPhones.length > 0
      ? rawPhones
      : buyer.contact.phone
        ? [{ label: 'Primary', number: buyer.contact.phone }]
        : []
  const emails =
    rawEmails.length > 0
      ? rawEmails
      : buyer.contact.email
        ? [{ label: 'Primary', email: buyer.contact.email }]
        : []

  const targetCities: string[] = (buyer as any).targetCities ?? []
  const targetZips: string[] = (buyer as any).targetZips ?? []
  const targetCounties: string[] = (buyer as any).targetCounties ?? []
  const targetStates: string[] = (buyer as any).targetStates ?? []
  const customQuestions: Record<string, unknown> = (buyer as any).customQuestions ?? {}
  const hasGeography =
    targetCities.length + targetZips.length + targetCounties.length + targetStates.length > 0
  const hasCustomAnswers = QUESTION_DEFS.some((q) => {
    const v = customQuestions[q.id]
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
  })

  return (
    <div>
      <Link href="/buyers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ChevronLeft className="w-4 h-4" />
        Buyers
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${buyer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {buyer.isActive ? 'Active' : 'Inactive'}
              </span>
              {(buyer as any).vipFlag && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                  VIP
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
                {buyer.contact.type === 'AGENT' ? 'Agent (of buyer)' : 'Buyer'}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              {buyer.contact.phone && <span>{buyer.contact.phone}</span>}
              {buyer.contact.email && <span>{buyer.contact.email}</span>}
            </div>
            {buyer.notes && <p className="text-sm text-gray-500 mt-2 max-w-lg">{buyer.notes}</p>}
          </div>
          <BuyerHeaderActions
            snapshot={{
              buyerId: buyer.id,
              firstName: buyer.contact.firstName ?? '',
              lastName: buyer.contact.lastName ?? '',
              contactType: buyer.contact.type === 'AGENT' ? 'AGENT' : 'BUYER',
              phones: Array.isArray((buyer.contact as any).phones)
                ? (buyer.contact as any).phones
                : buyer.contact.phone
                  ? [{ label: 'primary', number: buyer.contact.phone }]
                  : [],
              emails: Array.isArray((buyer.contact as any).emails)
                ? (buyer.contact as any).emails
                : buyer.contact.email
                  ? [{ label: 'primary', email: buyer.contact.email }]
                  : [],
              mailingAddress: (buyer.contact as any).mailingAddress ?? '',
              howHeardAbout: (buyer.contact as any).howHeardAbout ?? '',
              assignedUserId: (buyer.contact as any).assignedUserId ?? '',
              notes: buyer.notes ?? '',
              targetCities: (buyer as any).targetCities ?? [],
              targetZips: (buyer as any).targetZips ?? [],
              targetCounties: (buyer as any).targetCounties ?? [],
              targetStates: (buyer as any).targetStates ?? [],
              customQuestions: (buyer as any).customQuestions ?? {},
              vipFlag: !!(buyer as any).vipFlag,
              isActive: !!buyer.isActive,
            }}
          />
        </div>
        {buyer.preferredMarkets.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {buyer.preferredMarkets.map((m: string) => (
              <span key={m} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{m}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          {/* Personal Info — pulls every saved Contact field into one
              block so the user can see what they entered. */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-gray-400" />
              Personal Info
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <ProfileField label="First Name" value={buyer.contact.firstName} />
              <ProfileField label="Last Name" value={buyer.contact.lastName} />
              <ProfileField
                label="Contact Type"
                value={buyer.contact.type === 'AGENT' ? 'Agent (of buyer)' : 'Buyer'}
              />
              <ProfileField
                label="VIP"
                value={(buyer as any).vipFlag ? 'Yes' : 'No'}
              />
              <ProfileField
                label="How heard about us"
                value={(buyer.contact as any).howHeardAbout}
              />
              <ProfileField
                label="Owner"
                value={assignedUserName ?? (assignedUserId ? '(unknown user)' : null)}
              />
              <div className="col-span-2">
                <ProfileField
                  label="Mailing Address"
                  value={(buyer.contact as any).mailingAddress}
                />
              </div>
              <div className="col-span-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Phones
                </p>
                {phones.length === 0 ? (
                  <p className="text-sm text-gray-300">—</p>
                ) : (
                  <ul className="space-y-1">
                    {phones.map((p, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] uppercase tracking-wide text-gray-400 w-20">
                          {p.label || 'Phone'}
                        </span>
                        <span className="text-gray-900 font-mono text-[13px]">{p.number}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Emails
                </p>
                {emails.length === 0 ? (
                  <p className="text-sm text-gray-300">—</p>
                ) : (
                  <ul className="space-y-1">
                    {emails.map((e, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] uppercase tracking-wide text-gray-400 w-20">
                          {e.label || 'Email'}
                        </span>
                        <span className="text-gray-900 text-[13px]">{e.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </dl>
          </div>

          {/* Target Geography — only renders when at least one array
              has entries; otherwise the buyer detail page stays compact. */}
          {hasGeography && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                Target Geography
              </h3>
              <div className="space-y-2 text-sm">
                <GeoChips label="Cities" values={targetCities} />
                <GeoChips label="Zips" values={targetZips} />
                <GeoChips label="Counties" values={targetCounties} />
                <GeoChips label="States" values={targetStates} />
              </div>
            </div>
          )}

          {/* Buyer Preferences — answers to the configurable custom
              questions. Hidden if the buyer hasn't filled any in. */}
          {hasCustomAnswers && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <MegaphoneIcon className="w-4 h-4 text-gray-400" />
                Buyer Preferences
              </h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {QUESTION_DEFS.map((q) => {
                  const v = customQuestions[q.id]
                  if (v == null || v === '' || (Array.isArray(v) && v.length === 0))
                    return null
                  return <ProfileField key={q.id} label={q.label} value={formatAnswer(v)} />
                })}
              </dl>
            </div>
          )}

          <BuyerCriteriaCard buyerId={buyer.id} criteria={buyer.criteria as any} />
          <BuyerMatchHistoryCard matches={(buyer.matches as any[])?.map((m: any) => ({ ...m, score: Number(m.score), dispoOfferAmount: m.dispoOfferAmount ? Number(m.dispoOfferAmount) : null })) ?? []} />
        </div>
        <div className="space-y-4">
          <BuyerNotesCard
            buyerName={fullName}
            buyerId={buyer.id}
            matchedPropertyIds={(buyer.matches as any[])?.map((m: any) => m.propertyId) ?? []}
            propertyAddresses={Object.fromEntries(
              (buyer.matches as any[])
                ?.filter((m: any) => m.property?.streetAddress)
                .map((m: any) => [m.propertyId, [m.property.streetAddress, m.property.city, m.property.state, m.property.zip].filter(Boolean).join(', ')]) ?? []
            )}
          />
          <BuyerOfferHistoryCard offers={(buyer.offers as any[])?.map((o: any) => ({ ...o, dispoOfferAmount: o.dispoOfferAmount ? Number(o.dispoOfferAmount) : null, earnestMoney: o.earnestMoney ? Number(o.earnestMoney) : null, expectedProfit: o.expectedProfit ? Number(o.expectedProfit) : null })) ?? []} />
        </div>
      </div>
    </div>
  )
}

function ProfileField({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-gray-900 mt-0.5">{value || <span className="text-gray-300">—</span>}</dd>
    </div>
  )
}

function GeoChips({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-full"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}
