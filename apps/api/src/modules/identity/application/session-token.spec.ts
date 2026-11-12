import { describe, expect, it } from 'vitest';
import { parseInviteToken, parseSessionToken } from './session-token.js';

const id = '01a1cda5-1e8b-722a-9a04-3898bc1505e0';

describe('prefixed tokens', () => {
  it('splits on the first dot only', () => {
    expect(parseSessionToken(`${id}.abc.def`)).toEqual({ sessionId: id, secret: 'abc.def' });
    expect(parseInviteToken(`${id}.xyz`)).toEqual({ tenantId: id, secret: 'xyz' });
  });

  it.each(['', 'no-dot', `${id}.`, '.secret', 'not-a-uuid.secret', `${id}x.secret`])(
    'rejects %j',
    (token) => {
      expect(parseSessionToken(token)).toBeNull();
    },
  );
});
