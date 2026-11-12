import {
  boolean,
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
