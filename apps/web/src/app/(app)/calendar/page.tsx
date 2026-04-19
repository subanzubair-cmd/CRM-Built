import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getAppointmentList } from '@/lib/calendar'
import { CalendarHeader } from '@/components/calendar/CalendarHeader'
import { CalendarView } from '@/components/calendar/CalendarView'

export const metadata = { title: 'Calendar' }

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const from = new Date()
  from.setDate(from.getDate() - 30)
  const to = new Date()
  to.setDate(to.getDate() + 90)

  const { rows } = await getAppointmentList({ from, to, pageSize: 500 })

  // Serialize dates to ISO strings for RSC serialization
  const appointments = rows.map(a => ({
    ...a,
    startAt: a.startAt instanceof Date ? a.startAt.toISOString() : a.startAt,
    endAt: a.endAt instanceof Date ? a.endAt.toISOString() : a.endAt,
  }))

  return (
    <div className="p-5">
      <CalendarHeader />
      <div className="mt-4">
        <CalendarView appointments={appointments as any} />
      </div>
    </div>
  )
}
