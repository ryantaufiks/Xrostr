import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ErrorKind } from '../../domain/domain-error.js';
import { DomainErrorException } from './domain-error.exception.js';

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  locked: 423,
};

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  instance: string;
  [extension: string]: unknown;
}

/** Renders every error as RFC 9457 Problem Details. Unexpected errors reveal nothing. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const problem = this.toProblem(exception, request.originalUrl);
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown, instance: string): ProblemDetails {
    if (exception instanceof DomainErrorException) {
      const { kind, code, message, details } = exception.error;
      return {
        type: `urn:inroster:error:${code}`,
        title: message,
        status: STATUS_BY_KIND[kind],
        code,
        instance,
        ...details,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === 429 ? 'rate_limited' : `http_${status}`;
      return {
        type: `urn:inroster:error:${code}`,
        title: exception.message,
        status,
        code,
        instance,
      };
    }
    this.logger.error(exception);
    return {
      type: 'urn:inroster:error:internal',
      title: 'An unexpected error occurred.',
      status: 500,
      code: 'internal',
      instance,
    };
  }
}
