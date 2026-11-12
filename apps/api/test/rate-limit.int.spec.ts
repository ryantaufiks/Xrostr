import type { INestApplication } from '@nestjs/common';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp } from './support/test-app.js';

describe('rate limiting', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    ({ app, http } = await startApp({ rateLimitEnabled: true }));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('allows 10 login attempts per minute, then answers 429', async () => {
    const attempt = () =>
      http
        .post('/auth/login')
        .send({ tenantSlug: 'nobody', email: 'x@example.com', password: 'whatever-123' });
    for (let i = 0; i < 10; i++) await attempt().expect(401);
    const limited = await attempt().expect(429);
    expect(limited.body.code).toBe('rate_limited');
  });
});
