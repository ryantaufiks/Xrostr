import { DomainError } from '../../../shared/domain/domain-error.js';

export const LeaveErrors = {
  unknownType: () =>
    new DomainError('validation', 'leave_type_unknown', 'This leave type does not apply to you.'),
  notEligible: (months: number) =>
    new DomainError(
      'validation',
      'leave_not_eligible',
      `This leave needs ${months} months of service.`,
      {
        minServiceMonths: months,
      },
    ),
  crossesYear: () =>
    new DomainError(
      'validation',
      'leave_crosses_year',
      'Split leave that runs into the next year.',
    ),
  tooLong: (max: number) =>
    new DomainError('validation', 'leave_too_long', `A single request covers at most ${max} days.`),
  noLeaveDays: () =>
    new DomainError('validation', 'leave_no_days', 'Every day in this range is a public holiday.'),
  insufficient: (remaining: number) =>
    new DomainError(
      'validation',
      'leave_insufficient',
      `Only ${remaining} days left for this leave type.`,
      {
        remaining,
      },
    ),
  overlap: () =>
    new DomainError(
      'conflict',
      'leave_overlap',
      'You already have leave pending or approved on these dates.',
    ),
  notFound: () => new DomainError('not_found', 'leave_not_found', 'Leave request not found.'),
  notPending: () =>
    new DomainError('conflict', 'leave_not_pending', 'This request has already been decided.'),
  selfApproval: () =>
    new DomainError(
      'forbidden',
      'leave_self_approval',
      'Someone else must decide on your own leave.',
    ),
  holidayExists: () =>
    new DomainError('conflict', 'holiday_exists', 'There is already a holiday on this date.'),
  holidayNotFound: () => new DomainError('not_found', 'holiday_not_found', 'Holiday not found.'),
  notAnEmployee: () =>
    new DomainError('forbidden', 'not_an_employee', 'Your account is not linked to an employee.'),
};
