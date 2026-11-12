import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

/** IP and user agent of the caller, for audit records and session metadata. */
export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): ClientInfo => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return { ip: request.ip ?? null, userAgent: request.get('user-agent') ?? null };
});
