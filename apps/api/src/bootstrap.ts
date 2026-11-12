import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './shared/config/app-config.js';

/** Builds the HTTP application. Shared by main.ts and the end-to-end tests. */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  // One proxy hop (cloudflared) sits in front; makes request.ip the real client address.
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '100kb' });
  app.enableShutdownHooks();
  return app;
}
