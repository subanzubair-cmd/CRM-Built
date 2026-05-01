import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getVendorById } from '@/lib/vendors'
import { VendorHeaderActions } from '@/components/vendors/VendorHeaderActions'
import Link from 'next/link'
import { ChevronLeft, Phone, Mail, User as UserIcon } from 'lucide-react'
import { PhoneActions, EmailActions } from '@/components/ui/ContactActionButtons'
import { AdditionalContactsCard } from '@/components/ui/AdditionalContactsCard'
import { VendorNotesCard } from '@/components/vendors/VendorNotesCard'

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const vendor = await getVendorById(id)
  const name = vendor?.contact
    ? [vendor.contact.firstName, vendor.contact.lastName].filter(Boolean).join(' ')
    : ''
  return { title: name || 'Vendor' }
}

export default async function VendorDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const vendor = await getVendorById(id)
  if (!vendor) notFound()

  const fullName = [vendor.contact.firstName, vendor.contact.lastName].filter(Boolean).join(' ')

  // Resolve multi-value phones / emails the same way the buyer
  // detail page does — fall back to legacy single-value columns so
  // pre-migration rows still render with at least one entry.
  const rawPhones = Array.isArray((vendor.contact as any).phones)
    ? ((vendor.contact as any).phones as Array<{ label: string; number: string }>)
    : []
  const rawEmails = Array.isArray((vendor.contact as any).emails)
    ? ((vendor.contact as any).emails as Array<{ label: string; email: string }>)
    : []
  const phones =
    rawPhones.length > 0
      ? rawPhones
      : vendor.contact.phone
        ? [{ label: 'Primary', number: vendor.contact.phone }]
        : []
  const emails =
    rawEmails.length > 0
      ? rawEmails
      : vendor.contact.email
        ? [{ label: 'Primary', email: vendor.contact.email }]
        : []

  return (
    <div>
      <Link
        href="/vendors"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
      >
        <ChevronLeft className="w-4 h-4" />
        Vendors
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  vendor.isActive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {vendor.isActive ? 'Active' : 'Inactive'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
                {vendor.category}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              {vendor.contact.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {vendor.contact.phone}
                </span>
              )}
              {vendor.contact.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {vendor.contact.email}
                </span>
              )}
            </div>
            {vendor.notes && (
              <p className="text-sm text-gray-500 mt-2 max-w-lg">{vendor.notes}</p>
            )}
          </div>
          <VendorHeaderActions
            snapshot={{
              vendorId: vendor.id,
              displayName: fullName,
              firstName: vendor.contact.firstName ?? '',
              lastName: vendor.contact.lastName ?? '',
              phones: phones,
              emails: emails,
              category: vendor.category ?? '',
              markets: vendor.markets ?? [],
              notes: vendor.notes ?? '',
              isActive: !!vendor.isActive,
              howHeardAbout: (vendor.contact as any).howHeardAbout ?? '',
            }}
          />
        </div>
        {vendor.markets.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {vendor.markets.map((m) => (
              <span
                key={m}
                className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left main column */}
        <div className="col-span-2 space-y-4">
          {/* Personal Info — pulls every saved Contact field into one
              block so the operator can see what they entered. */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-gray-400" />
              Personal Info
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <ProfileField label="First Name" value={vendor.contact.firstName} />
              <ProfileField label="Last Name" value={vendor.contact.lastName} />
              <ProfileField label="Category" value={vendor.category} />
              <ProfileField
                label="How did you hear about us?"
                value={(vendor.contact as any).howHeardAbout}
              />
              <div className="col-span-2">
                <ProfileField
                  label="Mailing Address"
                  value={(vendor.contact as any).mailingAddress}
                />
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    Phones
                  </p>
                  {(vendor.contact as any).doNotCall && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600">No Call</span>
                  )}
                  {(vendor.contact as any).doNotText && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600">No SMS</span>
                  )}
                </div>
                {phones.length === 0 ? (
                  <p className="text-sm text-gray-300">—</p>
                ) : (
                  <ul className="space-y-2">
                    {phones.map((p, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">
                          {p.label || 'Phone'}
                        </span>
                        <span className="text-gray-900 font-mono text-[13px]">
                          {p.number}
                        </span>
                        <PhoneActions number={p.number} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    Emails
                  </p>
                  {(vendor.contact as any).doNotEmail && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600">No Email</span>
                  )}
                </div>
                {emails.length === 0 ? (
                  <p className="text-sm text-gray-300">—</p>
                ) : (
                  <ul className="space-y-2">
                    {emails.map((e, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">
                          {e.label || 'Email'}
                        </span>
                        <span className="text-gray-900 text-[13px]">{e.email}</span>
                        <EmailActions email={e.email} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </dl>
          </div>

          {/* Additional Contacts */}
          <AdditionalContactsCard subjectType="VENDOR" subjectId={vendor.id} />
        </div>

        {/* Right sidebar */}
        <div className="col-span-1">
          <VendorNotesCard
            vendorId={vendor.id}
            initialNotes={vendor.notes ?? null}
          />
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
      <dd className="text-gray-900 mt-0.5">
        {value || <span className="text-gray-300">—</span>}
      </dd>
    </div>
  )
}
