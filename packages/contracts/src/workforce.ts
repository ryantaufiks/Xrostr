import { z } from 'zod';
import { SYSTEM_ROLES } from './permissions.js';
import { ASSIGNMENT_TYPES, type AssignmentType } from './scheduling.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const EMPLOYMENT_TYPES = ['full_time', 'part_time'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const LOCATION_STATUSES = ['active', 'archived'] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

// ---------- Locations (sites) ----------

const locationFields = {
  name: z.string().trim().min(2).max(200),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, 'Use up to 20 letters, digits or hyphens'),
  address: optionalText(500),
  timezone: z.string().min(1).max(64),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  geofenceRadiusM: z.number().int().min(30).max(2000),
  /** Minutes between welfare checks for officers on shift here; null turns them off. */
  welfareIntervalMinutes: z.number().int().min(15).max(480).nullable().optional(),
};

export const createLocationSchema = z
  .object({ ...locationFields, legalEntityId: z.uuid() })
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    path: ['longitude'],
    message: 'Latitude and longitude go together',
  });
export type CreateLocationRequest = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z
  .object({ ...locationFields, status: z.enum(LOCATION_STATUSES) })
  .partial()
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    path: ['longitude'],
    message: 'Latitude and longitude go together',
  });
export type UpdateLocationRequest = z.infer<typeof updateLocationSchema>;

export interface LocationView {
  id: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number;
  welfareIntervalMinutes: number | null;
  status: LocationStatus;
  legalEntity: { id: string; name: string; countryCode: string };
}

// ---------- Employees ----------

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{8,20}$/, 'Use digits, optionally starting with +')
  .transform((v) => v.replace(/[ ()-]/g, ''));

export const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  phone: phone.nullable().optional(),
  employeeNo: z.string().trim().toUpperCase().min(1).max(30),
  legalEntityId: z.uuid(),
  locationId: z.uuid().nullable().optional(),
  jobTitle: optionalText(100),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  startDate: isoDate,
  role: z.enum(SYSTEM_ROLES),
  assignmentType: z.enum(ASSIGNMENT_TYPES).optional(),
  canRelieve: z.boolean().optional(),
  /** Sites this officer is cleared to guard besides their main site; empty = any site. */
  siteIds: z.array(z.uuid()).max(200).optional(),
});
export type CreateEmployeeRequest = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    phone: phone.nullable(),
    locationId: z.uuid().nullable(),
    jobTitle: optionalText(100),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    status: z.enum(EMPLOYEE_STATUSES),
    assignmentType: z.enum(ASSIGNMENT_TYPES),
    canRelieve: z.boolean(),
    siteIds: z.array(z.uuid()).max(200),
  })
  .partial();
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeSchema>;

export type AccountStatus = 'invited' | 'active' | 'disabled';

export interface EmployeeView {
  id: string;
  employeeNo: string;
  fullName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  employmentType: EmploymentType;
  startDate: string;
  status: EmployeeStatus;
  accountStatus: AccountStatus;
  role: string | null;
  assignmentType: AssignmentType;
  canRelieve: boolean;
  /** Sites cleared to guard besides the main site; empty means no restriction. */
  siteIds: string[];
  legalEntity: { id: string; name: string; countryCode: string };
  location: { id: string; name: string } | null;
}

export interface InviteLink {
  inviteToken: string;
  inviteExpiresAt: string;
}

export interface CreateEmployeeResponse extends InviteLink {
  employeeId: string;
}
