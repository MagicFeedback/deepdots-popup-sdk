import { describe, expect, it } from 'vitest';
import { InMemoryStorage } from '../tracking/tracking-manager';
import {
  SUSPENDED_SESSION_KEY,
  takeSuspendedSession,
  writeSuspendedSession,
  type SuspendedSession,
} from './suspended-session';

const WINDOW = 60_000;
const match = { integration: 'int-a', userId: 'u1' };
const session: SuspendedSession = { sessionId: 's1', integration: 'int-a', userId: 'u1', at: 1_000 };

describe('suspended analytics session', () => {
  it('round-trips and is consumed on read', () => {
    const storage = new InMemoryStorage();
    expect(writeSuspendedSession(storage, session)).toBe(true);
    expect(takeSuspendedSession(storage, match, 1_500, WINDOW)).toEqual(session);
    expect(storage.getItem(SUSPENDED_SESSION_KEY)).toBeNull();
    expect(takeSuspendedSession(storage, match, 1_500, WINDOW)).toBeNull();
  });

  it('ignores it outside the window, for another integration or another user — and still clears it', () => {
    for (const [now, m] of [
      [1_000 + WINDOW + 1, match],
      [500, match], // reloj hacia atrás
      [1_500, { ...match, integration: 'int-b' }],
      [1_500, { ...match, userId: 'u2' }],
      [1_500, { ...match, userId: null }],
    ] as const) {
      const storage = new InMemoryStorage();
      writeSuspendedSession(storage, session);
      expect(takeSuspendedSession(storage, m, now, WINDOW)).toBeNull();
      expect(storage.getItem(SUSPENDED_SESSION_KEY)).toBeNull();
    }
  });

  it('tolerates corrupt entries and storage that throws', () => {
    const corrupt = new InMemoryStorage();
    corrupt.setItem(SUSPENDED_SESSION_KEY, '{not json');
    expect(takeSuspendedSession(corrupt, match, 1_500, WINDOW)).toBeNull();
    corrupt.setItem(SUSPENDED_SESSION_KEY, JSON.stringify({ ...session, sessionId: '' }));
    expect(takeSuspendedSession(corrupt, match, 1_500, WINDOW)).toBeNull();

    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(writeSuspendedSession(throwing, session)).toBe(false);
    expect(takeSuspendedSession(throwing, match, 1_500, WINDOW)).toBeNull();
  });
});
