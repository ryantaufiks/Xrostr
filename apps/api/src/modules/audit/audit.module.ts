import { Module } from '@nestjs/common';
import { AuditLogReader, ListAuditLogUseCase } from './application/list-audit-log.use-case.js';
import { DrizzleAuditLogReader } from './infrastructure/drizzle-audit-log.reader.js';
import { AuditLogController } from './interface/http/audit-log.controller.js';

@Module({
  controllers: [AuditLogController],
  providers: [{ provide: AuditLogReader, useClass: DrizzleAuditLogReader }, ListAuditLogUseCase],
})
export class AuditModule {}
