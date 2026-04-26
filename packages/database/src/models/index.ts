/**
 * Sequelize model registry — barrel file.
 *
 * Order matters: classes that other classes have `@ForeignKey(() => X)`
 * pointing at must be registered first. We register Phase 3's parent
 * tables (User, Role) before the join/config tables that reference them.
 */
import { sequelize } from '../sequelize'

// ── Phase 2: Independent leaf models ────────────────────────────────────────
import { LeadSource } from './LeadSource'
import { TwilioNumber } from './TwilioNumber'
import { Tag } from './Tag'
import { Market } from './Market'
import { AiConfiguration } from './AiConfiguration'
import { GlobalFolder } from './GlobalFolder'
import { GlobalFile } from './GlobalFile'
import { ListStackSource } from './ListStackSource'
import { CommProviderConfig } from './CommProviderConfig'

// ── Phase 3: User & RBAC ────────────────────────────────────────────────────
import { User } from './User'
import { Role } from './Role'
import { UserRoleConfig } from './UserRoleConfig'
import { ApiToken } from './ApiToken'
import { UserCampaignAssignment } from './UserCampaignAssignment'
import { LeadCampaignRoleToggle } from './LeadCampaignRoleToggle'
import { PropertyTeamAssignment } from './PropertyTeamAssignment'

sequelize.addModels([
  // Phase 2 leaves
  LeadSource,
  TwilioNumber,
  Tag,
  Market,
  AiConfiguration,
  GlobalFolder,
  GlobalFile,
  ListStackSource,
  CommProviderConfig,

  // Phase 3: register parents first so @ForeignKey decorators on the
  // children can resolve them.
  Role,
  User,
  UserRoleConfig,
  ApiToken,
  UserCampaignAssignment,
  LeadCampaignRoleToggle,
  PropertyTeamAssignment,
])

// Wire cross-model associations AFTER addModels (the registry must be
// populated first).
import { wireAssociations } from './_associations'
wireAssociations()

// ── Public re-exports ───────────────────────────────────────────────────────
export {
  // Phase 2
  LeadSource,
  TwilioNumber,
  Tag,
  Market,
  AiConfiguration,
  GlobalFolder,
  GlobalFile,
  ListStackSource,
  CommProviderConfig,
  // Phase 3
  User,
  Role,
  UserRoleConfig,
  ApiToken,
  UserCampaignAssignment,
  LeadCampaignRoleToggle,
  PropertyTeamAssignment,
}
