import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { DomainError } from '../../domain/domain-error.js';
import { DomainErrorException } from './domain-error.exception.js';

/** Validates and normalises a request part with a shared contract schema. */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new DomainErrorException(
      new DomainError('validation', 'invalid_request', 'The request is invalid.', {
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }),
    );
  }
}
