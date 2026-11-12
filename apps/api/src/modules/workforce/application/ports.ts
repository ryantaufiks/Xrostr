import type {
  AssignmentType,
  EmployeeStatus,
  EmploymentType,
  LocationStatus,
} from '@xrostr/contracts';

export interface Location {
  id: string;
  legalEntityId: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number;
  welfareIntervalMinutes: number | null;
  status: LocationStatus;
  /** Printed in the site's check-in QR code. Never sent to the portal as part of a site. */
  checkinSecret: string;
}

export type NewLocation = Omit<Location, 'id' | 'status' | 'checkinSecret'>;
export type LocationChanges = Partial<Omit<Location, 'id' | 'legalEntityId' | 'checkinSecret'>>;

/** All methods require a tenant unit of work. */
export abstract class LocationRepository {
  abstract list(): Promise<Location[]>;
  abstract findById(id: string): Promise<Location | null>;
  abstract codeExists(code: string, exceptId?: string): Promise<boolean>;
  abstract insert(location: NewLocation): Promise<string>;
  abstract update(id: string, changes: LocationChanges): Promise<void>;
  abstract setCheckinSecret(id: string, secret: string): Promise<void>;
}

export interface Employee {
  id: string;
  userId: string;
  legalEntityId: string;
  locationId: string | null;
  employeeNo: string;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
  employmentType: EmploymentType;
  startDate: string;
  status: EmployeeStatus;
  assignmentType: AssignmentType;
  canRelieve: boolean;
}

export type NewEmployee = Omit<Employee, 'id' | 'status'>;
export type EmployeeChanges = Partial<
  Pick<
    Employee,
    | 'fullName'
    | 'phone'
    | 'jobTitle'
    | 'locationId'
    | 'employmentType'
    | 'status'
    | 'assignmentType'
    | 'canRelieve'
  >
>;

/** All methods require a tenant unit of work. */
export abstract class EmployeeRepository {
  abstract list(): Promise<Employee[]>;
  abstract findById(id: string): Promise<Employee | null>;
  abstract findByUserId(userId: string): Promise<Employee | null>;
  abstract employeeNoExists(employeeNo: string): Promise<boolean>;
  abstract insert(employee: NewEmployee): Promise<string>;
  abstract update(id: string, changes: EmployeeChanges): Promise<void>;
  /** Sites each employee is cleared to guard; employees with none are left out. */
  abstract allowedSites(employeeIds: readonly string[]): Promise<Map<string, string[]>>;
  abstract setAllowedSites(employeeId: string, locationIds: readonly string[]): Promise<void>;
}
