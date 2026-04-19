/**
 * Automation runner
 *
 * Executes AutomationAction records for a given trigger + property context.
 * Called from the BullMQ worker when an automation job is dequeued.
 *
 * Supported actions:
 *   ADD_TAG         — append to property.tags
 *   CHANGE_STAGE    — promote via same logic as promote route (simple Prisma update)
 *   ASSIGN_USER     — update property.assignedToId
 *   CREATE_TASK     — create a Task record linked to property
 *   ENROLL_CAMPAIGN — create a CampaignEnrollment record
 *   SEND_SMS        — log a Message record (real send in Phase 16)
 *   SEND_EMAIL      — log a Message record (real send in Phase 17)
 *   SEND_RVM        — log a Message record stub
 */

import { prisma } from './prisma.js'
import { sendSms, sendRvm } from './twilio.js'
import { sendEmail } from './email-adapter.js'
import { checkDndByPhone, checkDndByEmail } from './dnd.js'
import { substituteTemplateVars, buildTemplateContext } from '@crm/shared'

export interface AutomationJobData {
  trigger: string      // AutomationTrigger enum value
  propertyId: string
  meta?: Record<string, unknown>
}

export async function runAutomations(data: AutomationJobData): Promise<void> {
  const { trigger, propertyId } = data

  // Find matching active automations for this trigger
  const automations = await prisma.automation.findMany({
    where: { trigger: trigger as any, isActive: true },
    include: {
      actions: { orderBy: { order: 'asc' } },
    },
  })

  if (automations.length === 0) return

  // Load the property with template context
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      tags: true,
      assignedToId: true,
      propertyStatus: true,
      leadType: true,
      leadCampaignId: true,
      leadNumber: true,
      streetAddress: true,
      city: true,
      state: true,
      zip: true,
      assignedTo: { select: { name: true, email: true, phone: true } },
      leadCampaign: { select: { name: true } },
      contacts: {
        where: { isPrimary: true },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
        },
        take: 1,
      },
    },
  })
  if (!property) return

  const primaryContact = property.contacts[0]?.contact
  const tplCtx = buildTemplateContext({
    contact: primaryContact,
    property,
    user: property.assignedTo,
    campaign: property.leadCampaign,
  })

  for (const automation of automations) {
    console.log(`[automation] running "${automation.name}" (trigger: ${trigger}, property: ${propertyId})`)

    for (const action of automation.actions) {
      const cfg = action.config as Record<string, unknown>

      try {
        switch (action.actionType) {
          case 'ADD_TAG': {
            const tag = String(cfg.tag ?? '')
            if (tag && !property.tags.includes(tag)) {
              await prisma.property.update({
                where: { id: propertyId },
                data: { tags: { push: tag } },
              })
              property.tags.push(tag)
            }
            break
          }

          case 'ASSIGN_USER': {
            const userId = String(cfg.userId ?? '')
            if (userId) {
              await prisma.property.update({
                where: { id: propertyId },
                data: { assignedToId: userId },
              })
            }
            break
          }

          case 'CREATE_TASK': {
            await prisma.task.create({
              data: {
                propertyId,
                title: String(cfg.title ?? 'Automated Task'),
                description: cfg.description ? String(cfg.description) : undefined,
                dueAt: cfg.dueDaysFromNow
                  ? new Date(Date.now() + Number(cfg.dueDaysFromNow) * 86400000)
                  : undefined,
                assignedToId: String(cfg.assignedToId ?? property.assignedToId ?? ''),
                status: 'PENDING',
              },
            })
            break
          }

          case 'ENROLL_CAMPAIGN': {
            const campaignId = String(cfg.campaignId ?? '')
            if (campaignId) {
              // upsert — don't re-enroll if already enrolled
              await prisma.campaignEnrollment.upsert({
                where: { campaignId_propertyId: { campaignId, propertyId } },
                create: { campaignId, propertyId, currentStep: 0 },
                update: {},
              })
            }
            break
          }

          case 'CHANGE_STAGE': {
            const toStatus = String(cfg.toStatus ?? '')
            if (toStatus) {
              await prisma.property.update({
                where: { id: propertyId },
                data: {
                  propertyStatus: toStatus as any,
                  activityLogs: {
                    create: {
                      action: 'PIPELINE_CHANGE',
                      detail: {
                        description: `Automation "${automation.name}" changed stage to ${toStatus}`,
                        from: property.propertyStatus,
                        to: toStatus,
                      },
                    },
                  },
                },
              })
            }
            break
          }

          case 'SEND_SMS': {
            const to = String(cfg.to ?? cfg.phone ?? primaryContact?.phone ?? '')
            const from = String(cfg.from ?? process.env.TWILIO_DEFAULT_NUMBER ?? '')
            const body = substituteTemplateVars(String(cfg.body ?? ''), tplCtx)
            let twilioSid: string | undefined
            let failReason: string | undefined

            const block = await checkDndByPhone(to, 'sms')
            if (block) {
              failReason = `DND_BLOCKED: ${block}`
            } else if (to && from) {
              try {
                twilioSid = await sendSms(to, from, body)
              } catch (err: any) {
                failReason = `Twilio: ${err?.message ?? 'unknown error'}`
                console.error('[automation] sendSms failed:', err)
              }
            }
            await prisma.message.create({
              data: {
                propertyId,
                leadCampaignId: property.leadCampaignId ?? null,
                contactId: primaryContact?.id ?? null,
                channel: 'SMS',
                direction: 'OUTBOUND',
                body,
                to: to || undefined,
                from: from || undefined,
                twilioSid,
                failedAt: failReason ? new Date() : undefined,
                failReason: failReason ?? undefined,
                status: failReason ? 'failed' : 'sent',
              },
            })
            break
          }

          case 'SEND_RVM': {
            const to = String(cfg.to ?? cfg.phone ?? primaryContact?.phone ?? '')
            const from = String(cfg.from ?? process.env.TWILIO_DEFAULT_NUMBER ?? '')
            const audioUrl = String(cfg.audioUrl ?? '')
            let twilioSid: string | undefined
            let failReason: string | undefined

            // RVM is a call-channel delivery — honor doNotCall
            const block = await checkDndByPhone(to, 'call')
            if (block) {
              failReason = `DND_BLOCKED: ${block}`
            } else if (to && from && audioUrl) {
              try {
                twilioSid = await sendRvm(to, from, audioUrl)
              } catch (err: any) {
                failReason = `Twilio: ${err?.message ?? 'unknown error'}`
                console.error('[automation] sendRvm failed:', err)
              }
            }
            await prisma.message.create({
              data: {
                propertyId,
                leadCampaignId: property.leadCampaignId ?? null,
                contactId: primaryContact?.id ?? null,
                channel: 'RVM',
                direction: 'OUTBOUND',
                body: audioUrl,
                to: to || undefined,
                from: from || undefined,
                twilioSid,
                failedAt: failReason ? new Date() : undefined,
                failReason: failReason ?? undefined,
                status: failReason ? 'failed' : 'sent',
              },
            })
            break
          }

          case 'SEND_EMAIL': {
            const to = String(cfg.to ?? cfg.email ?? primaryContact?.email ?? '')
            const subject = substituteTemplateVars(
              String(cfg.subject ?? 'Message from Homeward Partners'),
              tplCtx,
            )
            const body = substituteTemplateVars(String(cfg.body ?? ''), tplCtx)
            let emailMessageId: string | undefined
            let failReason: string | undefined

            const block = await checkDndByEmail(to)
            if (block) {
              failReason = `DND_BLOCKED: ${block}`
            } else if (to) {
              try {
                emailMessageId = await sendEmail({ to, subject, html: `<p>${body}</p>` })
              } catch (err: any) {
                failReason = `Email: ${err?.message ?? 'unknown error'}`
                console.error('[automation] sendEmail failed:', err)
              }
            }
            await prisma.message.create({
              data: {
                propertyId,
                leadCampaignId: property.leadCampaignId ?? null,
                contactId: primaryContact?.id ?? null,
                channel: 'EMAIL',
                direction: 'OUTBOUND',
                body,
                subject: subject || undefined,
                to: to || undefined,
                emailMessageId,
                failedAt: failReason ? new Date() : undefined,
                failReason: failReason ?? undefined,
                status: failReason ? 'failed' : 'sent',
              },
            })
            break
          }

          default:
            console.warn(`[automation] unknown action type: ${action.actionType}`)
        }
      } catch (err) {
        console.error(`[automation] action ${action.actionType} failed:`, err)
      }
    }
  }
}
