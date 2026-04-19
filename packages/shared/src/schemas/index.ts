import { z } from 'zod'

export const PropertyCreateSchema = z.object({
  leadType: z.enum(['DIRECT_TO_SELLER', 'DIRECT_TO_AGENT']),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  county: z.string().optional(),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().optional(),
  sqft: z.number().int().optional(),
  yearBuilt: z.number().int().optional(),
  propertyType: z.string().optional(),
  source: z.string().optional(),
  campaignName: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  assignedToId: z.string().optional(),
  marketId: z.string().min(1, 'Market is required'),
})

export const ContactSchema = z.object({
  type: z.enum(['SELLER', 'BUYER', 'AGENT', 'VENDOR', 'OTHER']),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  phone2: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
})

export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  roleId: z.string().min(1),
  marketIds: z.array(z.string()).optional().default([]),
})

export const TaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: z.enum(['FOLLOW_UP', 'APPOINTMENT', 'OFFER', 'CALL', 'EMAIL', 'OTHER']).default('OTHER'),
  priority: z.number().int().min(0).max(2).default(0),
  dueAt: z.string().datetime().optional(),
  propertyId: z.string().optional(),
  assignedToId: z.string().optional(),
})

export const FilterStateSchema = z.object({
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assignedToId: z.string().optional(),
  marketId: z.string().optional(),
  isHot: z.boolean().optional(),
  isFavorited: z.boolean().optional(),
  stage: z.string().optional(),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).optional(),
})

export type PropertyCreateInput = z.infer<typeof PropertyCreateSchema>
export type ContactInput = z.infer<typeof ContactSchema>
export type UserCreateInput = z.infer<typeof UserCreateSchema>
export type TaskInput = z.infer<typeof TaskSchema>
export type FilterState = z.infer<typeof FilterStateSchema>
