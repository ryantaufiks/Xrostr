import { DomainError } from '../../../shared/domain/domain-error.js';

export const IdentityErrors = {
  invalidCredentials: () =>
    new DomainError('unauthorized', 'invalid_credentials', 'Email or password is incorrect.'),
  accountLocked: (until: Date) =>
    new DomainError('locked', 'account_locked', 'Too many failed attempts. Try again later.', {
      lockedUntil: until.toISOString(),
    }),
  mfaRequired: () =>
    new DomainError(
      'unauthorized',
      'mfa_required',
      'Enter the 6-digit code from your authenticator app.',
    ),
  invalidMfaCode: () =>
    new DomainError('unauthorized', 'invalid_mfa_code', 'The authentication code is incorrect.'),
  mfaAlreadyEnabled: () =>
    new DomainError('conflict', 'mfa_already_enabled', 'Two-factor authentication is already on.'),
  mfaSetupNotStarted: () =>
    new DomainError(
      'conflict',
      'mfa_setup_not_started',
      'Start two-factor setup before confirming it.',
    ),
  invalidRefreshToken: () =>
    new DomainError(
      'unauthorized',
      'invalid_refresh_token',
      'The session has expired. Sign in again.',
    ),
  // Not 401: a 401 would make the web proxy refresh and retry the same wrong password.
  invalidCurrentPassword: () =>
    new DomainError('forbidden', 'invalid_current_password', 'The current password is incorrect.'),
  emailTaken: () =>
    new DomainError(
      'conflict',
      'email_taken',
      'Another account in this company already uses this email.',
    ),
  userAlreadyActive: () =>
    new DomainError(
      'conflict',
      'user_already_active',
      'This person has already activated their account.',
    ),
  userNotFound: () => new DomainError('not_found', 'user_not_found', 'User not found.'),
  invalidInvite: () =>
    new DomainError('not_found', 'invalid_invite', 'This invitation is invalid, used or expired.'),
};
