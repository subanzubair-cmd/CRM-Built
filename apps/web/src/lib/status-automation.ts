import { prisma } from '@/lib/prisma'
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
    const automations = await (prisma as any).statusAutomation.findMany({
      where: { workspaceType, stageCode, isActive: true },
      select: {
        id: true,
        dripCampaignId: true,
        taskTemplateId: true,
        taskTitle: true,
        taskAssigneeId: true,
      },
    }) as Array<{
      id: string
      dripCampaignId: string | null
      taskTemplateId: string | null
      taskTitle: string | null
      taskAssigneeId: string | null
    }>

    if (automations.length === 0) return

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, assignedToId: true },
    })
    if (!property) return

    for (const a of automations) {
      // 1. Enroll in drip campaign (upsert — don't re-enroll if already)
      if (a.dripCampaignId) {
        await prisma.campaignEnrollment
          .upsert({
            where: {
              campaignId_propertyId: { campaignId: a.dripCampaignId, propertyId },
            },
            create: { campaignId: a.dripCampaignId, propertyId, currentStep: 0 },
            update: {},
          })
          .catch((err) => console.error('[status-automation] enroll failed:', err))
      }

      // 2. Create task
      const assignee = a.taskAssigneeId ?? property.assignedToId ?? null
      if (a.taskTemplateId) {
        const template = await prisma.template
          .findUnique({
            where: { id: a.taskTemplateId },
            select: { name: true, bodyContent: true },
          })
          .catch(() => null)
        if (template) {
          await prisma.task
            .create({
              data: {
                propertyId,
                title: template.name ?? a.taskTitle ?? 'Follow up',
                description: template.bodyContent || undefined,
                type: 'FOLLOW_UP',
                status: 'PENDING',
                assignedToId: assignee ?? undefined,
                sourceType: 'automation',
                templateId: a.taskTemplateId,
              },
            })
            .catch((err) => console.error('[status-automation] task create failed:', err))
        }
      } else if (a.taskTitle) {
        await prisma.task
          .create({
            data: {
              propertyId,
              title: a.taskTitle,
              type: 'FOLLOW_UP',
              status: 'PENDING',
              assignedToId: assignee ?? undefined,
              sourceType: 'automation',
            },
          })
          .catch((err) => console.error('[status-automation] task create failed:', err))
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
