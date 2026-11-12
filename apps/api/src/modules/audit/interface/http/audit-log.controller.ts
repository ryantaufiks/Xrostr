import { Controller, Get, Query } from '@nestjs/common';
import {
  CurrentPrincipal,
  RequirePermissions,
  type Principal,
} from '../../../identity/public-api.js';
import {
  ListAuditLogUseCase,
  type AuditRecord,
} from '../../application/list-audit-log.use-case.js';

@Controller('tenant/audit-log')
export class AuditLogController {
  constructor(private readonly listAuditLog: ListAuditLogUseCase) {}

  @RequirePermissions('audit.read')
  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('limit') limit?: string,
  ): Promise<AuditRecord[]> {
    return this.listAuditLog.execute(
      principal.subject.tenantId!,
      limit ? Number(limit) : undefined,
    );
  }
}
