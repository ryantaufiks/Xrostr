import { DomainError } from '../../../shared/domain/domain-error.js';

export const PatrolErrors = {
  routeNotFound: () =>
    new DomainError('not_found', 'patrol_route_not_found', 'Patrol route not found.'),
  routeNameTaken: () =>
    new DomainError(
      'conflict',
      'patrol_route_name_taken',
      'This site already has a route with that name.',
    ),
  routeArchived: () =>
    new DomainError('conflict', 'patrol_route_archived', 'This patrol route is archived.'),
  checkpointNotFound: () =>
    new DomainError('not_found', 'patrol_checkpoint_not_found', 'Checkpoint not found.'),
  reorderMismatch: () =>
    new DomainError(
      'validation',
      'patrol_reorder_mismatch',
      'List every active checkpoint of the route exactly once.',
    ),
  locationNotFound: () => new DomainError('not_found', 'location_not_found', 'Site not found.'),
  invalidTag: () =>
    new DomainError(
      'validation',
      'invalid_patrol_tag',
      'This tag is not a checkpoint of your company, or it has been replaced.',
    ),
  outsideShift: () =>
    new DomainError(
      'validation',
      'patrol_outside_shift',
      'Patrol scans count only during your published shift at this site.',
    ),
  roundNotFound: () =>
    new DomainError('not_found', 'patrol_round_not_found', 'Patrol round not found.'),
  roundClosed: () =>
    new DomainError('conflict', 'patrol_round_closed', 'This patrol round has already finished.'),
  rangeTooLong: () =>
    new DomainError('validation', 'range_too_long', 'Choose at most 62 days at a time.'),
  notAnEmployee: () =>
    new DomainError('forbidden', 'not_an_employee', 'Your account is not linked to an employee.'),
};
