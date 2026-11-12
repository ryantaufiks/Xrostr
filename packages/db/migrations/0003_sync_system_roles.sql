-- Brings the built-in roles of existing tenants in line with SYSTEM_ROLE_DEFINITIONS
-- after the employees.* and locations.* permissions were added.
UPDATE roles SET permissions = ARRAY['tenant.settings.read', 'tenant.settings.manage', 'entities.read', 'entities.manage', 'users.read', 'users.manage', 'roles.read', 'roles.manage', 'audit.read', 'employees.read', 'employees.manage', 'locations.read', 'locations.manage']::text[] WHERE is_system AND key = 'tenant_admin';--> statement-breakpoint
UPDATE roles SET permissions = ARRAY['tenant.settings.read', 'entities.read', 'users.read', 'users.manage', 'audit.read', 'employees.read', 'employees.manage', 'locations.read']::text[] WHERE is_system AND key = 'hr';--> statement-breakpoint
UPDATE roles SET permissions = ARRAY['users.read', 'employees.read', 'locations.read']::text[] WHERE is_system AND key = 'supervisor';--> statement-breakpoint
UPDATE roles SET permissions = '{}'::text[] WHERE is_system AND key = 'employee';
