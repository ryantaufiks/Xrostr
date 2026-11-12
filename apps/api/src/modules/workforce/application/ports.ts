import type { EmployeeStatus, EmploymentType, LocationStatus } from '@xrostr/contracts';

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
  status: LocationStatus;
}

export type NewLocation = Omit<Location, 'id' | 'status'>;
export type LocationChanges = Partial<Omit<Location, 'id' | 'legalEntityId'>>;

/** All methods require a tenant unit of work. */
export abstract class LocationRepository {
  abstract list(): Promise<Location[]>;
  abstract findById(id: string): Promise<Location | null>;
  abstract codeExists(code: string, exceptId?: string): Promise<boolean>;
  abstract insert(location: NewLocation): Promise<string>;
  abstract update(id: string, changes: LocationChanges): Promise<void>;
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
}

export type NewEmployee = Omit<Employee, 'id' | 'status'>;
export type EmployeeChanges = Partial<
  Pick<Employee, 'fullName' | 'phone' | 'jobTitle' | 'locationId' | 'employmentType' | 'status'>
>;

/** All methods require a tenant unit of work. */
export abstract class EmployeeRepository {
  abstract list(): Promise<Employee[]>;
  abstract findById(id: string): Promise<Employee | null>;
  abstract findByUserId(userId: string): Promise<Employee | null>;
  abstract employeeNoExists(employeeNo: string): Promise<boolean>;
  abstract insert(employee: NewEmployee): Promise<string>;
  abstract update(id: string, changes: EmployeeChanges): Promise<void>;
}
