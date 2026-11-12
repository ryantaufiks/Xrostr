/** Tenant-level permissions. Roles are named bundles of these. */
export const PERMISSIONS = [
  'tenant.settings.read',
  'tenant.settings.manage',
  'entities.read',
  'entities.manage',
  'users.read',
  'users.manage',
  'roles.read',
  'roles.manage',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const SYSTEM_ROLES = ['tenant_admin', 'hr', 'supervisor', 'employee'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export interface SystemRoleDefinition {
  readonly key: SystemRole;
  readonly name: string;
  readonly permissions: readonly Permission[];
  /** Users holding this role must enrol in TOTP before they can use the API. */
  readonly mfaRequired: boolean;
}

export const SYSTEM_ROLE_DEFINITIONS: readonly SystemRoleDefinition[] = [
  { key: 'tenant_admin', name: 'Tenant Admin', permissions: PERMISSIONS, mfaRequired: true },
  {
    key: 'hr',
    name: 'HR / Payroll',
    permissions: [
      'tenant.settings.read',
      'entities.read',
      'users.read',
      'users.manage',
      'audit.read',
    ],
    mfaRequired: true,
  },
  {
    key: 'supervisor',
    name: 'Manager / Supervisor',
    permissions: ['users.read'],
    mfaRequired: false,
  },
  { key: 'employee', name: 'Employee', permissions: [], mfaRequired: false },
];
