'use client'

import { LeadFormModal } from './LeadFormModal'

interface Props {
  open: boolean
  onClose: () => void
}

/** Dashboard "Add New Lead" — user picks the lead type inside the modal. */
export function AddLeadModal(props: Props) {
  return <LeadFormModal {...props} variant="standard" />
}
