import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { GlobalHeader } from '@/components/layout/GlobalHeader'
import { AppShellClient } from '@/components/layout/AppShellClient'
import { TimezoneProvider } from '@/components/providers/TimezoneProvider'
import { getCompanySettings } from '@/lib/company-settings'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  // Read CRM-wide settings once per request and pipe them down via
  // context. Every date-display component (MessageThread, ActivityCard,
  // /activity, lead detail timestamps, etc.) renders through this zone
  // regardless of the user's machine locale.
  const { timezone } = await getCompanySettings()

  // GlobalHeader and Sidebar are SERVER components — they await auth()
  // and hit the DB. We render them here on the server and pass the
  // resulting JSX tree as props to AppShellClient (a client
  // component). AppShellClient never imports them, so its bundle
  // doesn't transitively pull in Sequelize / pg / @crm/database.
  // It only decides WHEN to mount them (after hydration) so browser
  // extensions can't trip a structural hydration mismatch.
  return (
    <TimezoneProvider timezone={timezone}>
      <AppShellClient header={<GlobalHeader />} sidebar={<Sidebar />}>
        {children}
      </AppShellClient>
    </TimezoneProvider>
  )
}
