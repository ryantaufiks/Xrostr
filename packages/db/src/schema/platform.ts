import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, version } from './columns.js';

// Platform tables hold no tenant business data, so they carry no RLS policy.

export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  dataRegion: text('data_region').notNull(),
  plan: text('plan').notNull(),
  status: text('status').notNull().default('active'),
  ...timestamps,
  version: version(),
});

export const platformAdmins = pgTable('platform_admins', {
  id: id(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  mfaSecretEnc: text('mfa_secret_enc'),
  mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  locale: text('locale'),
  ...timestamps,
});

/**
 * Refresh-token sessions for both platform admins and tenant users. Only a SHA-256
 * hash of the secret is stored. Rotation keeps one family per login; reusing a
 * rotated token revokes the whole family.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    stage: text('stage').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_family_idx').on(t.familyId),
    index('sessions_subject_idx').on(t.subjectId),
  ],
);

/** Transactional outbox: written in the same transaction as the change it describes. */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: id(),
    tenantId: uuid('tenant_id'),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    index('outbox_pending_idx')
      .on(t.availableAt)
      .where(sql`${t.processedAt} is null`),
  ],
);

/** Append-only log of platform actions, including superadmin access to tenant data. */
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: id(),
    tenantId: uuid('tenant_id'),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('platform_audit_created_idx').on(t.createdAt)],
);
