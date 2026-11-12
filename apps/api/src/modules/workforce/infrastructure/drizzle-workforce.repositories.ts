import { Injectable } from '@nestjs/common';
import type { EmployeeStatus, EmploymentType, LocationStatus } from '@xrostr/contracts';
import { employees, locations } from '@xrostr/db';
import { and, asc, eq, ne } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  EmployeeRepository,
  LocationRepository,
  type Employee,
  type EmployeeChanges,
  type Location,
  type LocationChanges,
  type NewEmployee,
  type NewLocation,
} from '../application/ports.js';

type LocationRow = typeof locations.$inferSelect;
type EmployeeRow = typeof employees.$inferSelect;

const toLocation = (r: LocationRow): Location => ({
  id: r.id,
  legalEntityId: r.legalEntityId,
  name: r.name,
  code: r.code,
  address: r.address,
  timezone: r.timezone,
  latitude: r.latitude,
  longitude: r.longitude,
  geofenceRadiusM: r.geofenceRadiusM,
  status: r.status as LocationStatus,
});

const toEmployee = (r: EmployeeRow): Employee => ({
  id: r.id,
  userId: r.userId,
  legalEntityId: r.legalEntityId,
  locationId: r.locationId,
  employeeNo: r.employeeNo,
  fullName: r.fullName,
  phone: r.phone,
  jobTitle: r.jobTitle,
  employmentType: r.employmentType as EmploymentType,
  startDate: r.startDate,
  status: r.status as EmployeeStatus,
});

@Injectable()
export class DrizzleLocationRepository extends LocationRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async list(): Promise<Location[]> {
    const rows = await this.ctx.executor().select().from(locations).orderBy(asc(locations.name));
    return rows.map(toLocation);
  }

  async findById(id: string): Promise<Location | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    return row ? toLocation(row) : null;
  }

  async codeExists(code: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.ctx
      .executor()
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.code, code), exceptId ? ne(locations.id, exceptId) : undefined))
      .limit(1);
    return row !== undefined;
  }

  async insert(location: NewLocation): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(locations)
      .values({ ...location, tenantId: this.ctx.tenantId() })
      .returning({ id: locations.id });
    return row!.id;
  }

  async update(id: string, changes: LocationChanges): Promise<void> {
    if (Object.keys(changes).length === 0) return;
    await this.ctx.executor().update(locations).set(changes).where(eq(locations.id, id));
  }
}

@Injectable()
export class DrizzleEmployeeRepository extends EmployeeRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async list(): Promise<Employee[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(employees)
      .orderBy(asc(employees.fullName));
    return rows.map(toEmployee);
  }

  async findById(id: string): Promise<Employee | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    return row ? toEmployee(row) : null;
  }

  async employeeNoExists(employeeNo: string): Promise<boolean> {
    const [row] = await this.ctx
      .executor()
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.employeeNo, employeeNo))
      .limit(1);
    return row !== undefined;
  }

  async insert(employee: NewEmployee): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(employees)
      .values({ ...employee, tenantId: this.ctx.tenantId() })
      .returning({ id: employees.id });
    return row!.id;
  }

  async update(id: string, changes: EmployeeChanges): Promise<void> {
    if (Object.keys(changes).length === 0) return;
    await this.ctx.executor().update(employees).set(changes).where(eq(employees.id, id));
  }
}
