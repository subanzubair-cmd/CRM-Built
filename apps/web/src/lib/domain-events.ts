import { prisma } from './prisma'

interface DomainEvent {
  type: string
  propertyId?: string
  userId?: string
  actorType?: string
  payload?: Record<string, unknown>
}

/**
 * Emit a domain event — logs to ActivityLog and can trigger automations.
 * Call this AFTER the main operation in API routes.
 */
export async function emitEvent(event: DomainEvent) {
  // 1. Write to activity log
  if (event.propertyId) {
    await prisma.activityLog.create({
      data: {
        propertyId: event.propertyId,
        action: event.type,
        detail: event.payload ? JSON.stringify(event.payload) : undefined,
        actorType: event.actorType || 'system',
        userId: event.userId || null,
      },
    }).catch((err) => console.error('[events] Activity log write failed:', err))
  }
}

// Event type constants
export const DomainEvents = {
  LEAD_CREATED: 'lead.created',
  LEAD_UPDATED: 'lead.updated',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_MARKED_DEAD: 'lead.marked_dead',
  LEAD_MARKED_WARM: 'lead.marked_warm',
  LEAD_UNDER_CONTRACT: 'lead.under_contract',
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  COMMUNICATION_LOGGED: 'communication.logged',
  ASSIGNMENT_CHANGED: 'assignment.changed',
  TAG_ADDED: 'tag.added',
  AUTOMATION_TRIGGERED: 'automation.triggered',
  DRIP_STEP_EXECUTED: 'drip.step_executed',
  AI_ACTION_COMPLETED: 'ai.action_completed',
  OFFER_CREATED: 'offer.created',
  PROJECTION_ACTIVATED: 'projection.activated',
  TEAM_MEMBER_ASSIGNED: 'team.member_assigned',
  TEAM_MEMBER_REMOVED: 'team.member_removed',
  TEAM_AUTO_POPULATED: 'team.auto_populated',
} as const

export type DomainEventType = typeof DomainEvents[keyof typeof DomainEvents]
