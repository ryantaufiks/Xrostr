import { DomainError } from '../../../shared/domain/domain-error.js';

export const SchedulingErrors = {
  locationNotFound: () => new DomainError('not_found', 'location_not_found', 'Site not found.'),
  locationArchived: () =>
    new DomainError('validation', 'location_archived', 'This site is archived.'),
  employeeNotFound: () => new DomainError('not_found', 'employee_not_found', 'Employee not found.'),
  employeeInactive: () =>
    new DomainError('validation', 'employee_inactive', 'This employee is inactive.'),
  employeeOtherEntity: () =>
    new DomainError(
      'validation',
      'employee_other_entity',
      'The employee is contracted by another legal entity than the site’s.',
    ),
  shiftOverlap: () =>
    new DomainError(
      'conflict',
      'shift_overlap',
      'This employee already has a shift that overlaps this time.',
    ),
  shiftNotFound: () => new DomainError('not_found', 'shift_not_found', 'Shift not found.'),
  shiftAlreadyCancelled: () =>
    new DomainError('conflict', 'shift_already_cancelled', 'This shift is already cancelled.'),
  rangeTooLong: () =>
    new DomainError('validation', 'range_too_long', 'Choose at most 62 days at a time.'),
  notAnEmployee: () =>
    new DomainError('forbidden', 'not_an_employee', 'Your account is not linked to an employee.'),
};
