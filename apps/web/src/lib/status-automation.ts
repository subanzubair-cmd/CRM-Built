import {
  StatusAutomation,
  CampaignEnrollment,
  Property,
  Task,
  Template,
} from '@crm/database'
import { emitEvent, DomainEvents } from '@/lib/domain-events'

/**
 * Fire all active StatusAutomation rows matching (workspaceType, stageCode).
 * Each automation can enroll a drip campaign and/or create a task.
 *
 * Safe to call fire-and-forget: all errors are swallowed and logged so a
 * single automation failure can't break the triggering request.
 */
export async function runStatusAutomations(
  propertyId: string,
  workspaceType: 'leads' | 'tm' | 'inventory' | 'sold' | 'rental',
  stageCode: string,
  actorUserId?: string,
): Promise<void> {
  try {
    const automations = (await StatusAutomation.findAll({
      where: { workspaceType, stageCode, isActive: true },
      attributes: [
        'id',
        'dripCampaignId',
        'taskTemplateId',
        'taskTitle',
        'taskAssigneeId',
      ],
      raw: true,
    })) as Array<{
      id: string
      dripCampaignId: string | null
      taskTemplateId: string | null
      taskTitle: string | null
      taskAssigneeId: string | null
    }>

    if (automations.length === 0) return

    const property = await Property.findByPk(propertyId, {
      attributes: ['id', 'assignedToId'],
    })
    if (!property) return

    for (const a of automations) {
      // 1. Enroll in drip campaign (composite-unique upsert via findOrCreate)
      if (a.dripCampaignId) {
        try {
          await CampaignEnrollment.findOrCreate({
            where: { campaignId: a.dripCampaignId, propertyId },
            defaults: {
              campaignId: a.dripCampaignId,
              propertyId,
              currentStep: 0,
            },
          })
        } catch (err) {
          console.error('[status-automation] enroll failed:', err)
        }
      }

      // 2. Create task (with optional template lookup)
      const assignee = a.taskAssigneeId ?? property.assignedToId ?? null
      if (a.taskTemplateId) {
        const template = await Template.findByPk(a.taskTemplateId, {
          attributes: ['name', 'bodyContent'],
        }).catch(() => null)
        if (template) {
          try {
            await Task.create({
              propertyId,
              title: template.name ?? a.taskTitle ?? 'Follow up',
              description: template.bodyContent || undefined,
              type: 'FOLLOW_UP',
              status: 'PENDING',
              assignedToId: assignee ?? undefined,
              sourceType: 'automation',
              templateId: a.taskTemplateId,
            })
          } catch (err) {
            console.error('[status-automation] task create failed:', err)
          }
        }
      } else if (a.taskTitle) {
        try {
          await Task.create({
            propertyId,
            title: a.taskTitle,
            type: 'FOLLOW_UP',
            status: 'PENDING',
            assignedToId: assignee ?? undefined,
            sourceType: 'automation',
          })
        } catch (err) {
          console.error('[status-automation] task create failed:', err)
        }
      }

      void emitEvent({
        type: DomainEvents.AUTOMATION_TRIGGERED,
        propertyId,
        userId: actorUserId,
        actorType: 'system',
        payload: {
          statusAutomationId: a.id,
          workspaceType,
          stageCode,
          dripCampaignId: a.dripCampaignId,
          taskCreated: Boolean(a.taskTitle || a.taskTemplateId),
        },
      })
    }
  } catch (err) {
    console.error('[status-automation] runStatusAutomations failed:', err)
  }
}
