-- Shift integrity rules that Drizzle cannot express, plus the schedules.* permissions.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE shifts ADD CONSTRAINT shifts_valid_span CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '24 hours');--> statement-breakpoint
-- One person cannot hold two live shifts that overlap in time.
ALTER TABLE shifts ADD CONSTRAINT shifts_no_overlap EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status <> 'cancelled');--> statement-breakpoint
UPDATE roles SET permissions = ARRAY['tenant.settings.read', 'tenant.settings.manage', 'entities.read', 'entities.manage', 'users.read', 'users.manage', 'roles.read', 'roles.manage', 'audit.read', 'employees.read', 'employees.manage', 'locations.read', 'locations.manage', 'schedules.read', 'schedules.manage']::text[] WHERE is_system AND key = 'tenant_admin';--> statement-breakpoint
UPDATE roles SET permissions = ARRAY['tenant.settings.read', 'entities.read', 'users.read', 'users.manage', 'audit.read', 'employees.read', 'employees.manage', 'locations.read', 'schedules.read']::text[] WHERE is_system AND key = 'hr';--> statement-breakpoint
UPDATE roles SET permissions = ARRAY['users.read', 'employees.read', 'locations.read', 'schedules.read', 'schedules.manage']::text[] WHERE is_system AND key = 'supervisor';--> statement-breakpoint
UPDATE roles SET permissions = '{}'::text[] WHERE is_system AND key = 'employee';
