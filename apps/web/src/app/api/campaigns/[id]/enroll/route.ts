import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/auth-utils'
import { z } from 'zod'
import {
  Campaign,
  CampaignEnrollment,
  CAMPAIGN_ENROLLMENT_SUBJECT_TYPE_VALUES,
  CAMPAIGN_CONTACT_SCOPE_VALUES,
} from '@crm/database'

/**
 * /api/campaigns/[id]/enroll
 *   POST   enroll one subject (the per-lead "Auto Follow-up" modal hits here)
 *   DELETE soft-stop one subject's enrollment
 *
 * Both require `campaigns.manage` (carry-forward QA #2).
 *
 * The POST payload mirrors the spec's activation modal:
 *   subjectType / subjectId — polymorphic target (Property / Buyer / Vendor).
 *                              For Leads + Sold modules, subjectType=PROPERTY.
 *   phoneNumberId            — outbound caller-ID for SMS/email steps
 *   firstStepAt              — explicit fire time for step 0; if absent
 *                              the executor falls back to the first
 *                              step's delay
 *   autoStopOnReply          — halt the drip when the lead replies
 *   contactScope             — PRIMARY (default) | ALL
 *
 * Backwards-compat: if the legacy `propertyId` field is passed
 * (without subjectType/subjectId), we shim it into a PROPERTY
 * enrollment so the old QuickActionBar / Settings panels keep
 * working until they switch to the new modal.
 */

const SubjectType = z.enum(
  CAMPAIGN_ENROLLMENT_SUBJECT_TYPE_VALUES as [string, ...string[]],
)
const ContactScope = z.enum(
  CAMPAIGN_CONTACT_SCOPE_VALUES as [string, ...string[]],
)

const EnrollSchema = z
  .object({
    // New shape:
    subjectType: SubjectType.optional(),
    subjectId: z.string().min(1).optional(),
    phoneNumberId: z.string().min(1).nullable().optional(),
    firstStepAt: z.string().datetime().nullable().optional(),
    autoStopOnReply: z.boolean().default(false),
    contactScope: ContactScope.default('PRIMARY'),

    // Legacy shape — still accepted; we coerce into the new one.
    propertyId: z.string().min(1).optional(),
  })
  .refine(
    (d) => Boolean(d.subjectId) || Boolean(d.propertyId),
    { message: 'Provide either subjectType+subjectId or propertyId' },
  )

const UnenrollSchema = z
  .object({
    subjectType: SubjectType.optional(),
    subjectId: z.string().min(1).optional(),
    propertyId: z.string().min(1).optional(),
  })
  .refine(
    (d) => Boolean(d.subjectId) || Boolean(d.propertyId),
    { message: 'Provide either subjectType+subjectId or propertyId' },
  )

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id: campaignId } = await params
  const campaign = (await Campaign.findByPk(campaignId, {
    attributes: ['id', 'status', 'module'],
    raw: true,
  })) as { id: string; status: string; module: string } | null
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
  if (campaign.status === 'ARCHIVED' || campaign.status === 'COMPLETED') {
    return NextResponse.json(
      { error: `Cannot enroll into a ${campaign.status} campaign.` },
      { status: 422 },
    )
  }

  const body = await req.json()
  const parsed = EnrollSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  const subjectType = (data.subjectType ?? 'PROPERTY') as 'PROPERTY' | 'BUYER' | 'VENDOR'
  const subjectId = (data.subjectId ?? data.propertyId)!

  // Sanity-check subjectType against the campaign's module: a Buyers
  // campaign should only ever enroll BUYER subjects, etc. PROPERTY
  // covers both LEADS and SOLD.
  const allowedSubjectByModule: Record<string, string> = {
    LEADS: 'PROPERTY',
    SOLD: 'PROPERTY',
    BUYERS: 'BUYER',
    VENDORS: 'VENDOR',
  }
  const expected = allowedSubjectByModule[campaign.module]
  if (expected && expected !== subjectType) {
    return NextResponse.json(
      {
        error: `This campaign targets the ${campaign.module} module — subjectType must be ${expected}, got ${subjectType}.`,
      },
      { status: 422 },
    )
  }

  // Composite-unique upsert on (campaignId, subjectType, subjectId).
  // The legacy unique on (campaignId, propertyId) is still satisfied
  // because we mirror subjectId onto propertyId for PROPERTY rows.
  const [enrollment, created] = await CampaignEnrollment.findOrCreate({
    where: { campaignId, subjectType, subjectId },
    defaults: {
      campaignId,
      subjectType,
      subjectId,
      propertyId: subjectType === 'PROPERTY' ? subjectId : '',
      currentStep: 0,
      isActive: true,
      phoneNumberId: data.phoneNumberId ?? null,
      firstStepAt: data.firstStepAt ? new Date(data.firstStepAt) : null,
      autoStopOnReply: data.autoStopOnReply,
      contactScope: data.contactScope as any,
    } as any,
  })

  if (!created) {
    // Re-activating an existing enrollment — reset progress + apply
    // the new activation knobs from this call.
    await enrollment.update({
      isActive: true,
      currentStep: 0,
      completedAt: null,
      pausedAt: null,
      phoneNumberId: data.phoneNumberId ?? enrollment.phoneNumberId ?? null,
      firstStepAt: data.firstStepAt ? new Date(data.firstStepAt) : null,
      autoStopOnReply: data.autoStopOnReply,
      contactScope: data.contactScope as any,
    } as any)
  }

  return NextResponse.json(enrollment, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const deny = requirePermission(session, 'campaigns.manage')
  if (deny) return deny

  const { id: campaignId } = await params
  const body = await req.json()
  const parsed = UnenrollSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  const subjectType = (data.subjectType ?? 'PROPERTY') as 'PROPERTY' | 'BUYER' | 'VENDOR'
  const subjectId = (data.subjectId ?? data.propertyId)!

  await CampaignEnrollment.update(
    { isActive: false },
    { where: { campaignId, subjectType, subjectId } },
  )
  return new NextResponse(null, { status: 204 })
}
