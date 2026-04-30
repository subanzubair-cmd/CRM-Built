import { CampaignEnrollment, ActivityLog } from '@crm/database'

/**
 * autoStopDripOnReply — called when a lead replies via SMS or call.
 *
 * Walks every active enrollment whose `subjectId` matches the
 * property and whose `autoStopOnReply` flag is true, and marks it
 * inactive. Per spec, this fires regardless of which step the drip
 * is currently on — once the lead reaches out, the rest of the
 * sequence is moot.
 *
 * Designed to be invoked from:
 *   - the inbound SMS handler (apps/web/src/app/api/webhooks/telnyx)
 *     after a Message row is created
 *   - the inbound call.initiated webhook after the ActiveCall row is
 *     created
 *
 * Both call sites pass the property id; the BUYER / VENDOR variants
 * aren't wired yet because their inbound paths don't exist.
 *
 * Best-effort: errors here are logged and swallowed — we never fail
 * a webhook over an auto-stop bookkeeping issue.
 */
export async function autoStopDripOnReply(args: {
  propertyId: string
  reason: 'INBOUND_SMS' | 'INBOUND_CALL'
}): Promise<void> {
  const { propertyId, reason } = args
  if (!propertyId) return
  try {
    const stopped = await CampaignEnrollment.findAll({
      where: {
        subjectType: 'PROPERTY',
        subjectId: propertyId,
        isActive: true,
        autoStopOnReply: true,
        completedAt: null,
      },
      attributes: ['id', 'campaignId'],
      raw: true,
    })
    if (stopped.length === 0) return

    await CampaignEnrollment.update(
      { isActive: false, completedAt: new Date() } as any,
      {
        where: {
          id: { ['$in' as any]: stopped.map((e: any) => e.id) },
        } as any,
      },
    )

    // Record one ActivityLog per affected campaign so the operator
    // can see why a drip stopped early.
    await Promise.all(
      stopped.map((e: any) =>
        ActivityLog.create({
          propertyId,
          action: 'DRIP_AUTO_STOPPED',
          detail: {
            description: `Drip campaign auto-stopped — ${reason === 'INBOUND_SMS' ? 'lead replied via SMS' : 'lead called back'}.`,
            campaignId: e.campaignId,
            enrollmentId: e.id,
            reason,
          },
        } as any).catch(() => {}),
      ),
    )

    console.log(
      `[drip auto-stop] property ${propertyId} (${reason}) — stopped ${stopped.length} enrollment(s)`,
    )
  } catch (err) {
    console.warn('[drip auto-stop] failed:', err)
  }
}
