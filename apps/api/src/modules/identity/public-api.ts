// The only file other modules may import from the identity module.
export {
  TenantIdentityProvisioner,
  type ProvisionedAdmin,
} from './application/tenant-identity-provisioner.js';
export { TenantUserAccess, type IssuedInvite } from './application/tenant-user-access.js';
export type { UserSummary } from './application/ports.js';
export type { Principal } from './domain/principal.js';
export {
  AllowMfaSetup,
  CurrentPrincipal,
  PlatformOnly,
  Public,
  RequirePermissions,
  TenantUser,
} from './interface/http/auth.decorators.js';
