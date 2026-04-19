/**
 * Substitute {{variable}} tokens in a template string.
 *
 * Supports nested dotted paths like {{contact.firstName}} and
 * {{property.streetAddress}}. Missing keys render as an empty string by
 * default — safer than leaving raw {{tokens}} visible to customers.
 *
 * Case-insensitive whitespace around the token name is tolerated.
 */
export function substituteTemplateVars(
  template: string,
  vars: Record<string, unknown>,
  options: { keepUnknown?: boolean } = {},
): string {
  if (!template) return template
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path: string) => {
    const value = resolvePath(vars, path)
    if (value === undefined || value === null) {
      return options.keepUnknown ? match : ''
    }
    return String(value)
  })
}

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: any = obj
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

export interface TemplateContext {
  contact?: {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
  } | null
  property?: {
    streetAddress?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    leadNumber?: string | null
  } | null
  user?: {
    name?: string | null
    email?: string | null
    phone?: string | null
  } | null
  campaign?: {
    name?: string | null
  } | null
}

/**
 * Build a convenient context from common domain objects. Pass into
 * substituteTemplateVars for drip/template rendering.
 */
export function buildTemplateContext(ctx: TemplateContext): Record<string, unknown> {
  const contact = ctx.contact ?? {}
  const property = ctx.property ?? {}
  return {
    ...ctx,
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    fullName: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    address: property.streetAddress ?? '',
    propertyAddress: [property.streetAddress, property.city, property.state].filter(Boolean).join(', '),
    propertyCity: property.city ?? '',
    propertyState: property.state ?? '',
    propertyZip: property.zip ?? '',
    leadNumber: property.leadNumber ?? '',
    agentName: ctx.user?.name ?? '',
    campaignName: ctx.campaign?.name ?? '',
  }
}
