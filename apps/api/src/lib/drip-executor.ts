import {
  CampaignEnrollment,
  Campaign,
  CampaignStep,
  Property,
  PropertyContact,
  Contact,
  User,
  Message,
  Op,
} from '@crm/database'
import { sendSms } from './twilio.js'
import { rewriteForProperty } from './ai-rewrite.js'
import { checkDndByPhone } from './dnd.js'
import { substituteTemplateVars, buildTemplateContext } from '@crm/shared'

const MAX_STEP_ATTEMPTS = 3

export async function processDripCampaigns(): Promise<void> {
  const now = new Date()

  const enrollmentRows = await CampaignEnrollment.findAll({
    where: { isActive: true, completedAt: null },
    include: [
      {
        model: Campaign,
        as: 'campaign',
        include: [
          {
            model: CampaignStep,
            as: 'steps',
            where: { isActive: true },
            required: false,
            separate: true,
            order: [['order', 'ASC']],
          },
        ],
      },
      {
        model: Property,
        as: 'property',
        attributes: [
          'id', 'assignedToId', 'leadCampaignId', 'leadNumber', 'streetAddress',
          'city', 'state', 'zip', 'source', 'activeLeadStage',
        ],
        include: [
          { model: User, as: 'assignedTo', attributes: ['name', 'email', 'phone'] },
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
      },
    ],
  })

  const enrollments = enrollmentRows.map((e) => e.get({ plain: true }) as any)

  for (const enrollment of enrollments) {
    try {
      await processOne(enrollment, now)
    } catch (err) {
      console.error(`[drip] enrollment ${enrollment.id} failed:`, err)
    }
  }
}

async function processOne(enrollment: any, now: Date): Promise<void> {
  const steps: any[] = enrollment.campaign?.steps ?? []
  if (steps.length === 0) return

  const currentStepIndex: number = enrollment.currentStep
  if (currentStepIndex >= steps.length) {
    await CampaignEnrollment.update(
      { completedAt: now, isActive: false },
      { where: { id: enrollment.id } },
    )
    return
  }

  const step = steps[currentStepIndex]
  if (!step) return

  const lastEventAt =
    currentStepIndex === 0 ? new Date(enrollment.enrolledAt) : new Date(enrollment.updatedAt)
  const delayMs = (step.delayDays * 24 * 60 + step.delayHours * 60) * 60 * 1000
  const fireAt = new Date(lastEventAt.getTime() + delayMs)
  if (now < fireAt) return

  const primaryContact = enrollment.property?.contacts?.[0]?.contact
  const recipientPhone = primaryContact?.phone ?? null

  const ctx = buildTemplateContext({
    contact: primaryContact,
    property: enrollment.property,
    user: enrollment.property?.assignedTo,
    campaign: { name: enrollment.campaign?.name },
  })
  let messageBody = substituteTemplateVars(step.body, ctx)

  if (enrollment.campaign?.aiEnabled && step.channel === 'SMS') {
    messageBody = await rewriteForProperty(messageBody, {
      streetAddress: enrollment.property.streetAddress,
      city: enrollment.property.city,
      state: enrollment.property.state,
      source: enrollment.property.source,
      activeLeadStage: enrollment.property.activeLeadStage,
    })
  }

  if (step.channel === 'SMS') {
    const block = await checkDndByPhone(recipientPhone, 'sms')
    if (block) {
      await Message.create({
        propertyId: enrollment.property.id,
        leadCampaignId: enrollment.property.leadCampaignId ?? null,
        contactId: primaryContact?.id ?? null,
        channel: 'SMS',
        direction: 'OUTBOUND',
        body: messageBody,
        to: recipientPhone ?? undefined,
        failedAt: now,
        failReason: `DND_BLOCKED: ${block}`,
        status: 'failed',
      } as any)
      await advanceStep(enrollment.id, currentStepIndex, steps.length, now)
      console.log(`[drip] enrollment ${enrollment.id} step ${currentStepIndex} DND-blocked; advanced`)
      return
    }
  }

  let twilioSid: string | undefined
  let failReason: string | undefined
  if (step.channel === 'SMS' && recipientPhone) {
    const fromNumber = process.env.TWILIO_DEFAULT_NUMBER ?? ''
    if (!fromNumber) {
      failReason = 'No TWILIO_DEFAULT_NUMBER configured'
    } else {
      try {
        twilioSid = await sendSms(recipientPhone, fromNumber, messageBody)
      } catch (err: any) {
        failReason = `Twilio: ${err?.message ?? 'unknown error'}`
        console.error('[drip] sendSms failed:', err)
      }
    }
  }

  const attemptsSoFar = await Message.count({
    where: {
      propertyId: enrollment.property.id,
      ...(primaryContact?.id ? { contactId: primaryContact.id } : {}),
      body: messageBody,
      failedAt: { [Op.ne]: null },
    },
  })

  const willRetry = Boolean(failReason) && attemptsSoFar + 1 < MAX_STEP_ATTEMPTS

  await Message.create({
    propertyId: enrollment.property.id,
    leadCampaignId: enrollment.property.leadCampaignId ?? null,
    contactId: primaryContact?.id ?? null,
    channel: step.channel,
    direction: 'OUTBOUND',
    subject: step.subject ? substituteTemplateVars(step.subject, ctx) : undefined,
    body: messageBody,
    sentById: enrollment.property.assignedToId ?? undefined,
    to: recipientPhone ?? undefined,
    twilioSid,
    failedAt: failReason ? now : undefined,
    failReason: failReason ?? undefined,
    status: failReason ? (willRetry ? 'retrying' : 'failed') : 'sent',
  } as any)

  if (failReason && willRetry) {
    console.log(
      `[drip] enrollment ${enrollment.id} step ${currentStepIndex} will retry (attempt ${attemptsSoFar + 1}/${MAX_STEP_ATTEMPTS})`,
    )
    return
  }

  await advanceStep(enrollment.id, currentStepIndex, steps.length, now)
  console.log(
    `[drip] enrollment ${enrollment.id} step ${currentStepIndex} ${failReason ? 'abandoned' : 'fired'} (channel: ${step.channel})`,
  )
}

async function advanceStep(
  enrollmentId: string,
  currentStepIndex: number,
  totalSteps: number,
  now: Date,
): Promise<void> {
  await CampaignEnrollment.update(
    {
      currentStep: currentStepIndex + 1,
      ...(currentStepIndex + 1 >= totalSteps
        ? { completedAt: now, isActive: false }
        : {}),
    },
    { where: { id: enrollmentId } },
  )
}
