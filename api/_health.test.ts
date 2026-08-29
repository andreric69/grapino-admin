import { describe, expect, it } from 'vitest';
import { errorMessage } from './_health.js';

describe('errorMessage', () => {
  it('liest die Nachricht aus einer echten Error-Instanz', () => {
    expect(errorMessage(new Error('kaputt'))).toBe('kaputt');
  });

  it('liest die Nachricht aus einem plain object mit message-Eigenschaft (z. B. ein Supabase-Netzwerkfehler)', () => {
    // Genau der Fall, der den urspruenglichen Bug ausgeloest hat: postgrest-js
    // liefert bei einem reinen Netzwerkfehler ein plain object statt eine
    // echte PostgrestError-Instanz zu werfen.
    expect(errorMessage({ message: 'FetchError: getaddrinfo failed', details: '', hint: '', code: '' })).toBe(
      'FetchError: getaddrinfo failed',
    );
  });

  it('faellt auf den generischen Text zurueck, wenn keine Nachricht ermittelbar ist', () => {
    expect(errorMessage(null)).toBe('Unbekannter Fehler.');
    expect(errorMessage(undefined)).toBe('Unbekannter Fehler.');
    expect(errorMessage('nur ein String')).toBe('Unbekannter Fehler.');
    expect(errorMessage({ code: 'PGRST301' })).toBe('Unbekannter Fehler.'); // kein message-Feld
    expect(errorMessage({ message: 42 })).toBe('Unbekannter Fehler.'); // message ist kein String
  });
});
