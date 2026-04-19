import Link from 'next/link'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { AddLeadButton } from '@/components/leads/AddLeadButton'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { getUnreadNotifications } from '@/lib/notifications'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { ProfileMenu } from '@/components/layout/ProfileMenu'

export async function GlobalHeader() {
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined
  const notifications = userId ? await getUnreadNotifications(userId) : []

  // Pull avatar + email from DB (session may not have all fields)
  const userRow = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, avatarUrl: true },
      })
    : null

  const displayName = userRow?.name ?? session?.user?.name ?? 'Unknown'
  const displayEmail = userRow?.email ?? session?.user?.email ?? ''
  const initials =
    displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??'

  return (
    <header className="h-[52px] flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 gap-3 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 w-[220px] flex-shrink-0">
        <div className="w-[26px] h-[26px] bg-blue-600 rounded-[6px] flex items-center justify-center text-white text-[11px] font-bold">
          HP
        </div>
        <span className="font-bold text-[15px] text-gray-900">Homeward Partners</span>
      </div>

      {/* Search */}
      <GlobalSearch />

      {/* Right side actions */}
      <div className="ml-auto flex items-center gap-2">
        <AddLeadButton />

        <Link
          href="/leads/dts?isHot=1"
          className="w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-100 transition-colors"
          title="Hot Leads"
        >
          🔥
        </Link>

        <NotificationBell initialNotifications={notifications} />

        <Link
          href="/calendar"
          className="w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center text-sm hover:bg-gray-100 transition-colors"
          title="Calendar"
        >
          📅
        </Link>

        <Link
          href="/analytics"
          className="w-8 h-8 rounded-[7px] bg-slate-50 border border-gray-200 flex items-center justify-center text-[11px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
          title="Financials & Analytics"
        >
          $
        </Link>

        <ProfileMenu
          name={displayName}
          email={displayEmail}
          initials={initials}
          avatarUrl={userRow?.avatarUrl ?? null}
        />
      </div>
    </header>
  )
}
