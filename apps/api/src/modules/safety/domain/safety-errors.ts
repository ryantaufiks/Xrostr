import { DomainError } from '../../../shared/domain/domain-error.js';

export const SafetyErrors = {
  notAnEmployee: () =>
    new DomainError('forbidden', 'not_an_employee', 'Your account is not linked to an employee.'),
  checkNotFound: () =>
    new DomainError('not_found', 'welfare_check_not_found', 'Welfare check not found.'),
  alertNotFound: () => new DomainError('not_found', 'alert_not_found', 'Alert not found.'),
  alertResolved: () =>
    new DomainError('conflict', 'alert_resolved', 'This alert has already been resolved.'),
};
