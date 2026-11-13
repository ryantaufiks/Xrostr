import { DomainError } from '../../../shared/domain/domain-error.js';

export const PayrollErrors = {
  legalEntityNotFound: () =>
    new DomainError('not_found', 'legal_entity_not_found', 'Legal entity not found.'),
  employeeNotFound: () => new DomainError('not_found', 'employee_not_found', 'Employee not found.'),
  shiftNotFound: () => new DomainError('not_found', 'shift_not_found', 'Shift not found.'),
  rangeTooLong: () =>
    new DomainError('validation', 'range_too_long', 'Choose a period of at most 62 days.'),
  revealForbidden: () =>
    new DomainError(
      'forbidden',
      'payroll_reveal_forbidden',
      'Only payroll managers may see full tax, BPJS and bank numbers.',
    ),
  correctionForbidden: () =>
    new DomainError(
      'forbidden',
      'timesheet_correction_forbidden',
      'Only planners and payroll managers may correct a timesheet.',
    ),
  shiftNotStarted: () =>
    new DomainError(
      'validation',
      'shift_not_started',
      'Only a published shift that has started can be corrected.',
    ),
  correctionOutOfRange: () =>
    new DomainError(
      'validation',
      'correction_out_of_range',
      'Corrected times must fall within four hours of the shift.',
    ),
  correctionOrder: () =>
    new DomainError(
      'validation',
      'correction_order',
      'The check-out must come after the check-in.',
    ),
};
