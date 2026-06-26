import { describe, it, expect, beforeEach } from 'vitest';
import {
  TrackingManager,
  InMemoryStorage,
  STORAGE_KEYS,
  buildSurveyIdentity,
} from './tracking-manager';

/**
 * Tabla de casos de paridad — Contrato común Fase 1 §8 (revisado).
 * El session_id lo provee el BACKEND (respuesta de POST /sdk/popups) y lo cosen por
 * user_id; el SDK solo lo cachea. El SDK NO genera ni expira sesiones.
 * Estos mismos casos deben replicarse en el SDK KMP (commonTest).
 */
describe('TrackingManager', () => {
  let storage: InMemoryStorage;
  let counter: number;
  const uuid = () => `uuid-${++counter}`;
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    storage = new InMemoryStorage();
    counter = 0;
    clock = 1_000_000;
  });

  const make = (overrides: Partial<ConstructorParameters<typeof TrackingManager>[0]> = {}) =>
    new TrackingManager({ storage, now, uuid, ...overrides });

  describe('user_id', () => {
    it('uses the client-provided id without generating or persisting one', () => {
      const tm = make({ clientUserId: 'client-123' });

      expect(tm.getUserId()).toBe('client-123');
      expect(storage.getItem(STORAGE_KEYS.userId)).toBeNull();
      expect(tm.isNewUser()).toBe(false);
    });

    it('generates a user_id once and reuses it on later starts (persistence)', () => {
      const first = make();
      expect(first.getUserId()).toBe('uuid-1');
      expect(storage.getItem(STORAGE_KEYS.userId)).toBe('uuid-1');
      expect(first.isNewUser()).toBe(true);

      const second = make(); // nuevo arranque, mismo storage
      expect(second.getUserId()).toBe('uuid-1'); // reutiliza, NO genera uuid-2
      expect(second.isNewUser()).toBe(false); // returning
    });

    it('stores first_seen when generating an id', () => {
      const tm = make();
      tm.getUserId();
      expect(storage.getItem(STORAGE_KEYS.firstSeen)).toBe(String(clock));
    });
  });

  describe('session_id (backend-owned)', () => {
    it('is null until the backend provides one', () => {
      expect(make().getSessionId()).toBeNull();
    });

    it('caches the session_id provided by the backend response', () => {
      const tm = make();
      tm.setSessionId('backend-session-1');
      expect(tm.getSessionId()).toBe('backend-session-1');
    });

    it('does not persist the session_id (backend stitches by user_id)', () => {
      const tm = make();
      tm.setSessionId('backend-session-1');
      // nada relacionado con sesión se guarda en storage
      expect(storage.getItem('deepdots.session.id')).toBeNull();
    });
  });

  describe('storage namespace', () => {
    it('uses the exact deepdots.* keys for identity only', () => {
      expect(STORAGE_KEYS.userId).toBe('deepdots.user_id');
      expect(STORAGE_KEYS.firstSeen).toBe('deepdots.user.first_seen');
    });
  });

  describe('setTrackingEnabled', () => {
    it('does not generate id nor accept a session when disabled', () => {
      const tm = make();
      tm.setTrackingEnabled(false);

      expect(tm.getUserId()).toBeNull();
      tm.setSessionId('ignored');
      expect(tm.getSessionId()).toBeNull();
      expect(storage.getItem(STORAGE_KEYS.userId)).toBeNull();
    });

    it('resumes after re-enabling without deleting persisted identity', () => {
      const tm = make();
      const id = tm.getUserId();

      tm.setTrackingEnabled(false);
      expect(tm.getUserId()).toBeNull();

      tm.setTrackingEnabled(true);
      expect(tm.getUserId()).toBe(id);
    });

    it('is enabled by default', () => {
      expect(make().isTrackingEnabled()).toBe(true);
    });
  });
});

describe('buildSurveyIdentity', () => {
  it('puts the user id in profile and session_id + user_id in metadata', () => {
    const { profile, metadata } = buildSurveyIdentity('user-1', 'session-1');

    expect(profile).toEqual([{ key: 'external-user-id', value: ['user-1'] }]);
    expect(metadata).toEqual([
      { key: 'session_id', value: ['session-1'] },
      { key: 'user_id', value: ['user-1'] },
    ]);
  });

  it('omits session_id when the backend has not provided one yet', () => {
    const { profile, metadata } = buildSurveyIdentity('user-1', null);
    expect(profile).toEqual([{ key: 'external-user-id', value: ['user-1'] }]);
    expect(metadata).toEqual([{ key: 'user_id', value: ['user-1'] }]);
  });

  it('includes mini_service in metadata when a mini-service is active (#33 CSAT)', () => {
    const { metadata } = buildSurveyIdentity('user-1', 'session-1', 'checkout');
    expect(metadata).toEqual([
      { key: 'session_id', value: ['session-1'] },
      { key: 'user_id', value: ['user-1'] },
      { key: 'mini_service', value: ['checkout'] },
    ]);
  });

  it('returns empty arrays when tracking yields no ids (disabled)', () => {
    const { profile, metadata } = buildSurveyIdentity(null, null);
    expect(profile).toEqual([]);
    expect(metadata).toEqual([]);
  });

  it('includes deepdots_analytics_feedback_session_id in metadata when analytics session is known', () => {
    const { metadata } = buildSurveyIdentity('user-1', 'session-1', null, 'fbk-sess-42');
    expect(metadata).toContainEqual({ key: 'deepdots_analytics_feedback_session_id', value: ['fbk-sess-42'] });
  });
});
