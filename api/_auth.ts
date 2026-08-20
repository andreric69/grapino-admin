import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from './_types.js';

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 Stunden

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('hex');
}

/** Erzeugt ein signiertes, zeitlich begrenztes Session-Token nach erfolgreichem Passwort-Login. */
export function createSessionToken(secret: string): string {
  const payload = { exp: Date.now() + SESSION_DURATION_MS };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Prueft Signatur und Ablaufzeit eines Session-Tokens. */
export function verifySessionToken(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const expectedSig = sign(payloadB64, secret);

  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as { exp: number };
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

/** Liest das Session-Token aus dem Authorization-Header und prueft es. Wirft nicht - gibt nur true/false zurueck. */
export function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  return verifySessionToken(header.slice('Bearer '.length), secret);
}
