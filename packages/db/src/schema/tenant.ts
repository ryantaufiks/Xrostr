import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, tenantIsolation, timestamps, version } from './columns.js';
import { tenants } from './platform.js';

// Every table in this file is tenant-scoped and protected by Row Level Security.

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

export const legalEntities = pgTable(
  'legal_entities',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    countryCode: text('country_code').notNull(),
    registrationNumber: text('registration_number'),
    ...timestamps,
    version: version(),
  },
  (t) => [index('legal_entities_tenant_idx').on(t.tenantId), tenantIsolation('legal_entities')],
).enableRLS();

export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: tenantId(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash'),
    status: text('status').notNull().default('invited'),
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
    version: version(),
  },
  (t) => [unique('users_tenant_email_uq').on(t.tenantId, t.email), tenantIsolation('users')],
).enableRLS();

export const roles = pgTable(
  'roles',
  {
    id: id(),
    tenantId: tenantId(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    permissions: text('permissions').array().notNull().default([]),
    isSystem: boolean('is_system').notNull().default(false),
    mfaRequired: boolean('mfa_required').notNull().default(false),
    ...timestamps,
    version: version(),
  },
  (t) => [unique('roles_tenant_key_uq').on(t.tenantId, t.key), tenantIsolation('roles')],
).enableRLS();

export const userRoles = pgTable(
  'user_roles',
  {
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), tenantIsolation('user_roles')],
).enableRLS();

export const userInvites = pgTable(
  'user_invites',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantIsolation('user_invites')],
).enableRLS();

/** Append-only: the app role is granted INSERT and SELECT only. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    tenantId: tenantId(),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt),
    tenantIsolation('audit_log'),
  ],
).enableRLS();

/** Browser push endpoints of a user's devices (Web Push). One row per device. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('push_subscriptions_user_endpoint_uq').on(t.userId, t.endpoint),
    tenantIsolation('push_subscriptions'),
  ],
).enableRLS();

/** In-app inbox. Every notification is stored here and also pushed to the user's devices. */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    tenantIsolation('notifications'),
  ],
).enableRLS();

/** Work sites (client premises). The legal entity sets the country rules that apply there. */
export const locations = pgTable(
  'locations',
  {
    id: id(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id')
      .notNull()
      .references(() => legalEntities.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    address: text('address'),
    timezone: text('timezone').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    geofenceRadiusM: integer('geofence_radius_m').notNull().default(150),
    status: text('status').notNull().default('active'),
    ...timestamps,
    version: version(),
  },
  (t) => [unique('locations_tenant_code_uq').on(t.tenantId, t.code), tenantIsolation('locations')],
).enableRLS();

/** HR record of a person; `userId` is their login. One account per employee. */
export const employees = pgTable(
  'employees',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'restrict' }),
    legalEntityId: uuid('legal_entity_id')
      .notNull()
      .references(() => legalEntities.id),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    employeeNo: text('employee_no').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    jobTitle: text('job_title'),
    employmentType: text('employment_type').notNull(),
    startDate: date('start_date').notNull(),
    status: text('status').notNull().default('active'),
    ...timestamps,
    version: version(),
  },
  (t) => [
    unique('employees_tenant_no_uq').on(t.tenantId, t.employeeNo),
    index('employees_location_idx').on(t.locationId),
    tenantIsolation('employees'),
  ],
).enableRLS();
