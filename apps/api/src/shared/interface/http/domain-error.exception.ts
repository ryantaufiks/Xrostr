import type { DomainError } from '../../domain/domain-error.js';
import type { Result } from '../../domain/result.js';

/** Carries a DomainError out of a controller to the ProblemDetailsFilter. */
export class DomainErrorException extends Error {
  constructor(readonly error: DomainError) {
    super(error.message);
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw new DomainErrorException(result.error);
}
