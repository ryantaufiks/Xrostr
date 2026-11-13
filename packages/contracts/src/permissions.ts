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
  'employees.read',
  'employees.manage',
  'locations.read',
  'locations.manage',
  'schedules.read',
  'schedules.manage',
  'leave.approve',
  'holidays.manage',
  'patrols.read',
  'patrols.manage',
  'alerts.respond',
  'payroll.read',
  'payroll.manage',
  'payroll.approve',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const SYSTEM_ROLES = ['tenant_admin', 'hr', 'supervisor', 'employee'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Indonesian labels for the built-in roles, shown in the portal. */
export const ROLE_LABELS: Record<SystemRole, string> = {
  tenant_admin: 'Admin perusahaan',
  hr: 'HR / Payroll',
  supervisor: 'Supervisor',
  employee: 'Officer / Karyawan',
};

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
      'employees.read',
      'employees.manage',
      'locations.read',
      'schedules.read',
      'leave.approve',
      'holidays.manage',
      'patrols.read',
      'payroll.read',
      'payroll.manage',
    ],
    mfaRequired: true,
  },
  {
    key: 'supervisor',
    name: 'Manager / Supervisor',
    permissions: [
      'users.read',
      'employees.read',
      'locations.read',
      'schedules.read',
      'schedules.manage',
      'leave.approve',
      'patrols.read',
      'patrols.manage',
      'alerts.respond',
    ],
    mfaRequired: false,
  },
  { key: 'employee', name: 'Employee', permissions: [], mfaRequired: false },
];
