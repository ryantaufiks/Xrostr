import { Injectable } from '@nestjs/common';
import { EmployeeRepository, LocationRepository, type Employee, type Location } from './ports.js';

export type { Employee as WorkforceEmployee, Location as WorkforceLocation } from './ports.js';

/**
 * Public API of the workforce module: read access to employees and sites for other modules
 * (scheduling, attendance, leave). Must run inside the tenant's unit of work.
 */
@Injectable()
export class WorkforceDirectory {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly locations: LocationRepository,
  ) {}

  employee(id: string): Promise<Employee | null> {
    return this.employees.findById(id);
  }

  employeeOfUser(userId: string): Promise<Employee | null> {
    return this.employees.findByUserId(userId);
  }

  async employeesById(ids: readonly string[]): Promise<Map<string, Employee>> {
    const wanted = new Set(ids);
    const all = await this.employees.list();
    return new Map(all.filter((e) => wanted.has(e.id)).map((e) => [e.id, e]));
  }

  location(id: string): Promise<Location | null> {
    return this.locations.findById(id);
  }

  async locationsById(ids: readonly string[]): Promise<Map<string, Location>> {
    const wanted = new Set(ids);
    const all = await this.locations.list();
    return new Map(all.filter((l) => wanted.has(l.id)).map((l) => [l.id, l]));
  }
}
