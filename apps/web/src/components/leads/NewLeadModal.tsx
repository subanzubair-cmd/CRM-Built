'use client'

import { LeadFormModal } from './LeadFormModal'

interface Props {
  leadType: 'DIRECT_TO_SELLER' | 'DIRECT_TO_AGENT'
  onClose: () => void
}

/** Pipeline-page "New Lead" — lead type is locked to the pipeline being viewed. */
export function NewLeadModal({ leadType, onClose }: Props) {
  return <LeadFormModal open onClose={onClose} fixedLeadType={leadType} variant="compact" />
}
