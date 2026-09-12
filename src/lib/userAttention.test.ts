import { describe, expect, it } from 'vitest';
import { findInactiveUsers, findOverduePayments, findTrialsEndingSoon, type AttentionUser } from './userAttention';

const NOW = new Date('2026-09-12T12:00:00.000Z');

function makeUser(overrides: Partial<AttentionUser>): AttentionUser {
  return {
    id: 'u1',
    email: 'test@example.com',
    displayName: null,
    isBlocked: false,
    lastPayment: null,
    trialEndsAt: null,
    lastSignInAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findOverduePayments', () => {
  it('meldet eine offene Zahlungsanfrage, die seit mehr als 14 Tagen unbeantwortet ist', () => {
    const user = makeUser({ lastPayment: { reason: 'Zugangsgebühr', status: 'open', createdAt: '2026-08-20T00:00:00.000Z' } });
    const result = findOverduePayments([user], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysOverdue).toBe(23);
  });

  it('ignoriert offene Zahlungen, die erst seit kurzem offen sind (<=14 Tage)', () => {
    const user = makeUser({ lastPayment: { reason: 'Auftrag', status: 'open', createdAt: '2026-09-01T00:00:00.000Z' } });
    expect(findOverduePayments([user], NOW)).toHaveLength(0);
  });

  it('ignoriert bereits bezahlte oder stornierte Zahlungen', () => {
    const paid = makeUser({ lastPayment: { reason: 'x', status: 'paid', createdAt: '2026-01-01T00:00:00.000Z' } });
    const cancelled = makeUser({ lastPayment: { reason: 'x', status: 'cancelled', createdAt: '2026-01-01T00:00:00.000Z' } });
    expect(findOverduePayments([paid, cancelled], NOW)).toHaveLength(0);
  });

  it('ignoriert bereits blockierte Nutzer - das ist ein eigener, schon sichtbarer Zustand', () => {
    const user = makeUser({
      isBlocked: true,
      lastPayment: { reason: 'Zugangsgebühr', status: 'open', createdAt: '2026-08-01T00:00:00.000Z' },
    });
    expect(findOverduePayments([user], NOW)).toHaveLength(0);
  });
});

describe('findTrialsEndingSoon', () => {
  it('meldet ein Testabo, das in 2 Tagen ablaeuft', () => {
    const user = makeUser({ trialEndsAt: '2026-09-14T12:00:00.000Z' });
    const result = findTrialsEndingSoon([user], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysUntilEnd).toBe(2);
  });

  it('ignoriert Testabos, die schon abgelaufen sind', () => {
    const user = makeUser({ trialEndsAt: '2026-09-10T00:00:00.000Z' });
    expect(findTrialsEndingSoon([user], NOW)).toHaveLength(0);
  });

  it('ignoriert Testabos, die noch mehr als 3 Tage laufen', () => {
    const user = makeUser({ trialEndsAt: '2026-09-20T00:00:00.000Z' });
    expect(findTrialsEndingSoon([user], NOW)).toHaveLength(0);
  });

  it('ignoriert Nutzer mit bereits bezahlter letzter Zahlung, auch wenn ein altes Testabo-Datum noch gesetzt ist', () => {
    const user = makeUser({
      trialEndsAt: '2026-09-13T00:00:00.000Z',
      lastPayment: { reason: 'Zugangsgebühr', status: 'paid', createdAt: '2026-08-01T00:00:00.000Z' },
    });
    expect(findTrialsEndingSoon([user], NOW)).toHaveLength(0);
  });
});

describe('findInactiveUsers', () => {
  it('meldet einen Nutzer, der seit mehr als 60 Tagen nicht mehr eingeloggt war', () => {
    const user = makeUser({ createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: '2026-06-01T00:00:00.000Z' });
    const result = findInactiveUsers([user], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysInactive).toBe(103);
  });

  it('meldet einen Nutzer, der sich noch nie eingeloggt hat, sofern das Konto alt genug ist', () => {
    const user = makeUser({ createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: null });
    const result = findInactiveUsers([user], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysInactive).toBeNull();
  });

  it('ignoriert frisch angelegte Nutzer, die sich seit der Anmeldung noch nicht erneut eingeloggt haben', () => {
    const user = makeUser({ createdAt: '2026-09-11T00:00:00.000Z', lastSignInAt: null });
    expect(findInactiveUsers([user], NOW)).toHaveLength(0);
  });

  it('ignoriert Nutzer, die kuerzlich (<=60 Tage) noch eingeloggt waren', () => {
    const user = makeUser({ createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: '2026-08-01T00:00:00.000Z' });
    expect(findInactiveUsers([user], NOW)).toHaveLength(0);
  });
});
