'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Enrollment {
  id: string
  currentStep: number
  enrolledAt: Date | string
  property: {
    id: string
    streetAddress: string | null
    city: string | null
    propertyStatus: string
    leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  }
}

interface Props {
  campaignId: string
  enrollments: Enrollment[]
}

function propertyHref(p: { id: string; propertyStatus: string; leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT' }): string {
  if (p.propertyStatus === 'IN_TM') return `/tm/${p.id}`
  if (p.propertyStatus === 'IN_INVENTORY') return `/inventory/${p.id}`
  if (p.propertyStatus === 'IN_DISPO') return `/dispo/${p.id}`
  const base = p.leadType === 'DIRECT_TO_SELLER' ? '/leads/dts' : '/leads/dta'
  return `${base}/${p.id}`
}

export function EnrollmentList({ campaignId, enrollments }: Props) {
  const router = useRouter()

  async function handleUnenroll(propertyId: string) {
    if (!confirm('Remove this property from the campaign?')) return
    await fetch(`/api/campaigns/${campaignId}/enroll`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId }),
    })
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-[13px] font-semibold text-gray-900">
          Active Enrollments ({enrollments.length})
        </h3>
      </div>
      {enrollments.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No properties enrolled. Enroll from a property&#39;s detail page.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {enrollments.map((enr) => (
            <div key={enr.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link href={propertyHref(enr.property)}
                  className="text-sm font-medium text-blue-600 hover:underline truncate block">
                  {enr.property.streetAddress ?? 'No address'}{enr.property.city ? `, ${enr.property.city}` : ''}
                </Link>
                <p className="text-[11px] text-gray-400">
                  Step {enr.currentStep + 1} · enrolled {new Date(enr.enrolledAt).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => handleUnenroll(enr.property.id)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
