import {
  Property,
  PropertyContact,
  Contact,
  User,
  LeadCampaign,
  Automation,
  AutomationAction,
  Task,
  CampaignEnrollment,
  ActivityLog,
  Message,
  fn,
  col,
} from '@crm/database'
import { sendSms, sendRvm } from './twilio.js'
import { sendEmail } from './email-adapter.js'
import { checkDndByPhone, checkDndByEmail } from './dnd.js'
import { substituteTemplateVars, buildTemplateContext } from '@crm/shared'

export interface AutomationJobData {
  trigger: string
  propertyId: string
  meta?: Record<string, unknown>
}

export async function runAutomations(data: AutomationJobData): Promise<void> {
  const { trigger, propertyId } = data

  const automations = await Automation.findAll({
    where: { trigger, isActive: true },
    include: [
      {
        model: AutomationAction,
        as: 'actions',
        separate: true,
        order: [['order', 'ASC']],
      },
    ],
  })

  if (automations.length === 0) return

  const propertyRow = await Property.findByPk(propertyId, {
    attributes: [
      'id', 'tags', 'assignedToId', 'propertyStatus', 'leadType',
      'leadCampaignId', 'leadNumber', 'streetAddress', 'city', 'state', 'zip',
    ],
    include: [
      { model: User, as: 'assignedTo', attributes: ['name', 'email', 'phone'] },
      { model: LeadCampaign, as: 'leadCampaign', attributes: ['name'] },
      {
        model: PropertyContact,
        as: 'contacts',
        where: { isPrimary: true },
        required: false,
        separate: true,
        limit: 1,
        include: [
          { model: Contact, as: 'contact', attributes: ['id', 'firstName', 'lastName', 'phone', 'email'] },
        ],
      },
    ],
  })
  if (!propertyRow) return
  const property = propertyRow.get({ plain: true }) as any

  const primaryContact = property.contacts?.[0]?.contact
  const tplCtx = buildTemplateContext({
    contact: primaryContact,
    property,
    user: property.assignedTo,
    campaign: property.leadCampaign,
  })

  for (const automationRow of automations) {
    const automation = automationRow.get({ plain: true }) as any
    console.log(`[automation] running "${automation.name}" (trigger: ${trigger}, property: ${propertyId})`)

    for (const action of (automation.actions ?? [])) {
      const cfg = action.config as Record<string, unknown>

      try {
        switch (action.actionType) {
          case 'ADD_TAG': {
            const tag = String(cfg.tag ?? '')
            if (tag && !(property.tags ?? []).includes(tag)) {
              await Property.update(
                { tags: fn('array_append', col('tags'), tag) as any },
                { where: { id: propertyId } },
              )
              property.tags = [...(property.tags ?? []), tag]
            }
            break
          }

          case 'ASSIGN_USER': {
            const userId = String(cfg.userId ?? '')
            if (userId) {
              await Property.update({ assignedToId: userId }, { where: { id: propertyId } })
            }
            break
          }

          case 'CREATE_TASK': {
            await Task.create({
              propertyId,
              title: String(cfg.title ?? 'Automated Task'),
              description: cfg.description ? String(cfg.description) : undefined,
              dueAt: cfg.dueDaysFromNow
                ? new Date(Date.now() + Number(cfg.dueDaysFromNow) * 86400000)
                : undefined,
              assignedToId: String(cfg.assignedToId ?? property.assignedToId ?? ''),
              status: 'PENDING',
            } as any)
            break
          }

          case 'ENROLL_CAMPAIGN': {
            const campaignId = String(cfg.campaignId ?? '')
            if (campaignId) {
              await CampaignEnrollment.findOrCreate({
                where: { campaignId, propertyId },
                defaults: { campaignId, propertyId, currentStep: 0 } as any,
              })
            }
            break
          }

          case 'CHANGE_STAGE': {
            const toStatus = String(cfg.toStatus ?? '')
            if (toStatus) {
              await Property.update({ propertyStatus: toStatus as any }, { where: { id: propertyId } })
              await ActivityLog.create({
                propertyId,
                action: 'PIPELINE_CHANGE',
                detail: {
                  description: `Automation "${automation.name}" changed stage to ${toStatus}`,
                  from: property.propertyStatus,
                  to: toStatus,
                },
              } as any)
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
            await Message.create({
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
            } as any)
            break
          }

          case 'SEND_RVM': {
            const to = String(cfg.to ?? cfg.phone ?? primaryContact?.phone ?? '')
            const from = String(cfg.from ?? process.env.TWILIO_DEFAULT_NUMBER ?? '')
            const audioUrl = String(cfg.audioUrl ?? '')
            let twilioSid: string | undefined
            let failReason: string | undefined

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
            await Message.create({
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
            } as any)
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
            await Message.create({
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
            } as any)
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
