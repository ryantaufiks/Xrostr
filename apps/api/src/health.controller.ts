import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './modules/identity/public-api.js';
import { DatabaseContext } from './shared/infrastructure/database/database-context.js';

@Controller('health')
export class HealthController {
  constructor(private readonly ctx: DatabaseContext) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    await this.ctx.runInPlatform(() => this.ctx.executor().execute(sql`select 1`));
    return { status: 'ok' };
  }
}
