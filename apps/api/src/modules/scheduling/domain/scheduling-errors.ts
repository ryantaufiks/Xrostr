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
  zoneNotFound: () => new DomainError('not_found', 'zone_not_found', 'Zone not found.'),
  shiftNotDraft: () =>
    new DomainError(
      'conflict',
      'shift_not_draft',
      'Only draft shifts can be replaced; cancel a published shift instead.',
    ),
  zoneMixedSites: () =>
    new DomainError(
      'validation',
      'zone_mixed_sites',
      'A zone groups sites of one legal entity in one time zone.',
    ),
  zoneOtherEntity: () =>
    new DomainError(
      'validation',
      'zone_other_entity',
      'This employee is contracted by a different legal entity from the zone.',
    ),
  zoneNameTaken: () =>
    new DomainError('conflict', 'zone_name_taken', 'A zone with this name already exists.'),
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
  invalidCheckinCode: () =>
    new DomainError(
      'validation',
      'invalid_checkin_code',
      'This QR code is not valid for this site. Scan the poster on site again.',
    ),
  siteWithoutPoint: () =>
    new DomainError(
      'validation',
      'site_without_point',
      'This site has no GPS point yet. Ask your supervisor to set it.',
    ),
  outsideGeofence: (distanceM: number, radiusM: number) =>
    new DomainError(
      'validation',
      'outside_geofence',
      `You are ${distanceM} m from the site; check-in works within ${radiusM} m.`,
      { distanceM, radiusM },
    ),
  noActiveShift: () =>
    new DomainError(
      'validation',
      'no_active_shift',
      'You have no shift at this site right now. Check-in opens 2 hours before a shift.',
    ),
  alreadyCheckedOut: () =>
    new DomainError(
      'conflict',
      'already_checked_out',
      'You have already checked out of this shift.',
    ),
  notAnEmployee: () =>
    new DomainError('forbidden', 'not_an_employee', 'Your account is not linked to an employee.'),
};
