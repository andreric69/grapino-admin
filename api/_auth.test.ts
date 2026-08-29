import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from './_auth.js';

const SECRET = 'test-geheimnis-nur-fuer-diesen-test';

describe('Session-Token (Login der Admin-App)', () => {
  it('ein frisch erzeugtes Token ist gueltig', () => {
    const token = createSessionToken(SECRET);
    expect(verifySessionToken(token, SECRET)).toBe(true);
  });

  it('ein Token mit falschem Geheimnis ist ungueltig', () => {
    const token = createSessionToken(SECRET);
    expect(verifySessionToken(token, 'falsches-geheimnis')).toBe(false);
  });

  it('ein manipuliertes Token (Payload veraendert, Signatur alt) ist ungueltig', () => {
    const token = createSessionToken(SECRET);
    const [, sig] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ exp: Date.now() + 999_999_999 })).toString('base64url');
    expect(verifySessionToken(`${tamperedPayload}.${sig}`, SECRET)).toBe(false);
  });

  it('ein Token ohne Punkt-Trenner ist ungueltig', () => {
    expect(verifySessionToken('kein-gueltiges-token-format', SECRET)).toBe(false);
  });

  it('ein abgelaufenes Token ist ungueltig', () => {
    // Token von Hand mit einer Ablaufzeit in der Vergangenheit bauen, statt
    // 12 Stunden in einem Test zu warten.
    const payloadB64 = Buffer.from(JSON.stringify({ exp: Date.now() - 1000 })).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(payloadB64).digest('hex');
    expect(verifySessionToken(`${payloadB64}.${sig}`, SECRET)).toBe(false);
  });
});
