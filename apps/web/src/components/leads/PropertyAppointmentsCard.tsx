import { getAppointmentList } from '@/lib/calendar'
import { AppointmentList } from '@/components/calendar/AppointmentList'
import { AddAppointmentButton } from '@/components/leads/AddAppointmentButton'

interface Props {
  propertyId: string
}

export async function PropertyAppointmentsCard({ propertyId }: Props) {
  const { rows, total } = await getAppointmentList({ propertyId, pageSize: 50 })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          Appointments{total > 0 && <span className="text-gray-400 font-normal ml-1">({total})</span>}
        </h3>
        <AddAppointmentButton propertyId={propertyId} />
      </div>
      <AppointmentList rows={rows as any} total={total} />
    </div>
  )
}
