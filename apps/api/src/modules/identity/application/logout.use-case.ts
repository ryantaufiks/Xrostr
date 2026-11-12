import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/application/ports.js';
import type { Principal } from '../domain/principal.js';
import { SessionRepository } from './ports.js';
import { SubjectScope } from './subject-scope.js';

/** Revokes every refresh token issued since the caller signed in on this device. */
@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly scope: SubjectScope,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  execute(principal: Principal): Promise<void> {
    return this.scope.run(principal.subject, async () => {
      const session = await this.sessions.findById(principal.sessionId);
      if (!session) return;
      await this.sessions.revokeFamily(session.familyId, this.clock.now());
      await this.scope.record(principal.subject, {
        action: 'auth.logout',
        targetType: 'session_family',
        targetId: session.familyId,
      });
    });
  }
}
