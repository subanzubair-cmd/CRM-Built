export type Permission =
  | 'leads.view' | 'leads.create' | 'leads.edit' | 'leads.delete' | 'leads.hard_delete'
  | 'notes.edit' | 'notes.delete'
  | 'leads.assign' | 'leads.export' | 'leads.bulk_edit' | 'leads.move_stage'
  | 'tm.view' | 'tm.edit'
  | 'inventory.view' | 'inventory.edit'
  | 'dispo.view' | 'dispo.edit'
  | 'contacts.view' | 'contacts.edit'
  | 'comms.send' | 'comms.view'
  | 'tasks.view' | 'tasks.manage'
  | 'campaigns.view' | 'campaigns.manage'
  | 'analytics.view'
  | 'financials.view' | 'financials.edit'
  | 'automations.view' | 'automations.manage'
  | 'ai.configure' | 'ai.view_activity'
  | 'templates.view' | 'templates.manage'
  | 'phone.manage'
  | 'callflows.manage'
  | 'tags.manage'
  | 'webhooks.manage'
  | 'settings.view' | 'settings.manage'
  | 'users.view' | 'users.manage'
  | 'admin.all'

export interface JwtPayload {
  userId: string
  email: string
  name: string
  roleId: string
  permissions: Permission[]
  marketIds: string[]
}

export interface ApiError {
  error: string
  message?: string
  statusCode?: number
}
