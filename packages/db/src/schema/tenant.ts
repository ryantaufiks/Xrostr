import { sql } from 'drizzle-orm';
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
  uniqueIndex,
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
    /** Personal UI and notification language; null follows the tenant default. */
    locale: text('locale'),
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
    /** Secret printed in the site's check-in QR code; rotating it voids old posters. */
    checkinSecret: text('checkin_secret')
      .notNull()
      .default(
        sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`,
      ),
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

/**
 * One person on one site for one stretch of time. Times are UTC; the site's time zone turns
 * them into local dates. An exclusion constraint (migration 0005) stops overlapping shifts
 * for the same employee, even under concurrent writes.
 */
export const shifts = pgTable(
  'shifts',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Set once supervisors were told nobody checked in for this shift. */
    noShowAlertedAt: timestamp('no_show_alerted_at', { withTimezone: true }),
    ...timestamps,
    version: version(),
  },
  (t) => [
    index('shifts_location_starts_idx').on(t.locationId, t.startsAt),
    index('shifts_employee_starts_idx').on(t.employeeId, t.startsAt),
    tenantIsolation('shifts'),
  ],
).enableRLS();

/**
 * Check-ins and check-outs, one of each per shift at most. Position and the distance to the
 * site are kept as evidence.
 */
export const attendanceEvents = pgTable(
  'attendance_events',
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    kind: text('kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    accuracyM: integer('accuracy_m'),
    distanceM: integer('distance_m').notNull(),
    lateMinutes: integer('late_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('attendance_shift_kind_uq').on(t.shiftId, t.kind),
    index('attendance_employee_idx').on(t.employeeId, t.occurredAt),
    tenantIsolation('attendance_events'),
  ],
).enableRLS();

/** A tenant's public holidays per country, seeded from the Country Pack and editable. */
export const publicHolidays = pgTable(
  'public_holidays',
  {
    id: id(),
    tenantId: tenantId(),
    countryCode: text('country_code').notNull(),
    date: date('date').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('public_holidays_day_uq').on(t.tenantId, t.countryCode, t.date),
    tenantIsolation('public_holidays'),
  ],
).enableRLS();

/**
 * Remembers which (country, year) calendars were seeded, so a holiday an admin deleted is not
 * re-created on the next read.
 */
export const holidayCalendars = pgTable(
  'holiday_calendars',
  {
    tenantId: tenantId(),
    countryCode: text('country_code').notNull(),
    year: integer('year').notNull(),
    seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.countryCode, t.year] }),
    tenantIsolation('holiday_calendars'),
  ],
).enableRLS();

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    leaveType: text('leave_type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    days: integer('days').notNull(),
    reason: text('reason'),
    status: text('status').notNull().default('pending'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    ...timestamps,
    version: version(),
  },
  (t) => [
    index('leave_requests_employee_idx').on(t.employeeId, t.startDate),
    index('leave_requests_status_idx').on(t.status),
    tenantIsolation('leave_requests'),
  ],
).enableRLS();

/** A patrol route at one site: an ordered set of checkpoints an officer walks. */
export const patrolRoutes = pgTable(
  'patrol_routes',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    name: text('name').notNull(),
    /** Expected time between rounds during a shift; null when rounds are not scheduled. */
    intervalMinutes: integer('interval_minutes'),
    status: text('status').notNull().default('active'),
    ...timestamps,
    version: version(),
  },
  (t) => [
    unique('patrol_routes_name_uq').on(t.locationId, t.name),
    tenantIsolation('patrol_routes'),
  ],
).enableRLS();

export const patrolCheckpoints = pgTable(
  'patrol_checkpoints',
  {
    id: id(),
    tenantId: tenantId(),
    routeId: uuid('route_id')
      .notNull()
      .references(() => patrolRoutes.id),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    /** Secret in the checkpoint's QR code or NFC sticker; rotating it voids the old tag. */
    tagSecret: text('tag_secret')
      .notNull()
      .default(
        sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`,
      ),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    radiusM: integer('radius_m').notNull().default(30),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    unique('patrol_checkpoints_tag_uq').on(t.tenantId, t.tagSecret),
    index('patrol_checkpoints_route_idx').on(t.routeId, t.position),
    tenantIsolation('patrol_checkpoints'),
  ],
).enableRLS();

/** One walk of a route by one officer during one shift. */
export const patrolRounds = pgTable(
  'patrol_rounds',
  {
    id: id(),
    tenantId: tenantId(),
    routeId: uuid('route_id')
      .notNull()
      .references(() => patrolRoutes.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id),
    status: text('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** Active checkpoints when the round started; later edits to the route do not change it. */
    checkpointCount: integer('checkpoint_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One open round per officer per route, so two quick scans cannot start two rounds.
    uniqueIndex('patrol_rounds_one_open_uq')
      .on(t.routeId, t.employeeId)
      .where(sql`status = 'in_progress'`),
    index('patrol_rounds_route_idx').on(t.routeId, t.startedAt),
    index('patrol_rounds_employee_idx').on(t.employeeId, t.startedAt),
    tenantIsolation('patrol_rounds'),
  ],
).enableRLS();

export const patrolScans = pgTable(
  'patrol_scans',
  {
    id: id(),
    tenantId: tenantId(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => patrolRounds.id),
    checkpointId: uuid('checkpoint_id')
      .notNull()
      .references(() => patrolCheckpoints.id),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    accuracyM: integer('accuracy_m'),
    distanceM: integer('distance_m'),
    /** True inside the checkpoint radius, false outside, null when it could not be checked. */
    locationVerified: boolean('location_verified'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('patrol_scans_once_uq').on(t.roundId, t.checkpointId),
    tenantIsolation('patrol_scans'),
  ],
).enableRLS();
