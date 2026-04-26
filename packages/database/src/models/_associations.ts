/**
 * Centralized association wiring for Sequelize models.
 *
 * Loaded LAST from `models/index.ts` so all classes are already in the
 * Sequelize registry. As clusters migrate, append a small block per
 * cluster.
 */
import { GlobalFile } from './GlobalFile'
import { GlobalFolder } from './GlobalFolder'
import { User } from './User'
import { Role } from './Role'
import { UserRoleConfig } from './UserRoleConfig'
import { ApiToken } from './ApiToken'
import { UserCampaignAssignment } from './UserCampaignAssignment'
import { LeadCampaignRoleToggle } from './LeadCampaignRoleToggle'
import { PropertyTeamAssignment } from './PropertyTeamAssignment'

export function wireAssociations(): void {
  // ── Phase 2: Independent leaves ───────────────────────────────────────────
  GlobalFolder.hasMany(GlobalFile, { foreignKey: 'folderId', as: 'files' })
  GlobalFile.belongsTo(GlobalFolder, { foreignKey: 'folderId', as: 'folder' })

  // ── Phase 3: User & RBAC ──────────────────────────────────────────────────
  // User <- Role (each user has exactly one primary role).
  Role.hasMany(User, { foreignKey: 'roleId', as: 'users' })
  User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  // UserRoleConfig: per-(user, role) settings. Both onDelete: Cascade at
  // the DB level — don't repeat here.
  User.hasMany(UserRoleConfig, { foreignKey: 'userId', as: 'roleConfigs' })
  UserRoleConfig.belongsTo(User, { foreignKey: 'userId', as: 'user' })
  Role.hasMany(UserRoleConfig, { foreignKey: 'roleId', as: 'userConfigs' })
  UserRoleConfig.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  // ApiToken: belongs to a User.
  User.hasMany(ApiToken, { foreignKey: 'userId', as: 'apiTokens' })
  ApiToken.belongsTo(User, { foreignKey: 'userId', as: 'user' })

  // UserCampaignAssignment: only the User and Role sides for now.
  // The LeadCampaign side gets wired in Phase 4 when LeadCampaign migrates.
  User.hasMany(UserCampaignAssignment, { foreignKey: 'userId', as: 'campaignAssignments' })
  UserCampaignAssignment.belongsTo(User, { foreignKey: 'userId', as: 'user' })
  Role.hasMany(UserCampaignAssignment, { foreignKey: 'roleId', as: 'campaignAssignments' })
  UserCampaignAssignment.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  // LeadCampaignRoleToggle: only the Role side; LeadCampaign in Phase 4.
  Role.hasMany(LeadCampaignRoleToggle, { foreignKey: 'roleId', as: 'leadCampaignToggles' })
  LeadCampaignRoleToggle.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

  // PropertyTeamAssignment: User + Role only; Property in Phase 6.
  User.hasMany(PropertyTeamAssignment, {
    foreignKey: 'userId',
    as: 'propertyTeamAssignments',
  })
  PropertyTeamAssignment.belongsTo(User, { foreignKey: 'userId', as: 'user' })
  Role.hasMany(PropertyTeamAssignment, {
    foreignKey: 'roleId',
    as: 'propertyTeamAssignments',
  })
  PropertyTeamAssignment.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })
}
