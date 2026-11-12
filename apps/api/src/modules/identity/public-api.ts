// The only file other modules may import from the identity module.
export {
  TenantIdentityProvisioner,
  type ProvisionedAdmin,
} from './application/tenant-identity-provisioner.js';
export type { Principal } from './domain/principal.js';
export {
  AllowMfaSetup,
  CurrentPrincipal,
  PlatformOnly,
  Public,
  RequirePermissions,
} from './interface/http/auth.decorators.js';
