import { DomainError } from '../../../shared/domain/domain-error.js';

export const WorkforceErrors = {
  legalEntityNotFound: () =>
    new DomainError(
      'validation',
      'legal_entity_not_found',
      'Choose one of the company’s legal entities.',
    ),
  timezoneNotInCountry: (timezone: string, country: string) =>
    new DomainError(
      'validation',
      'timezone_not_in_country',
      `Time zone ${timezone} is not used in ${country}.`,
    ),
  locationCodeTaken: () =>
    new DomainError('conflict', 'location_code_taken', 'Another site already uses this code.'),
  locationNotFound: () => new DomainError('not_found', 'location_not_found', 'Site not found.'),
  locationInOtherEntity: () =>
    new DomainError(
      'validation',
      'location_in_other_entity',
      'The site belongs to another legal entity than the employee’s contract.',
    ),
  employeeNoTaken: () =>
    new DomainError('conflict', 'employee_no_taken', 'Another employee already has this number.'),
  employeeNotFound: () => new DomainError('not_found', 'employee_not_found', 'Employee not found.'),
};
