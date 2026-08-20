import type { VercelRequest, VercelResponse } from './_types.js';
import { timingSafeEqual } from 'node:crypto';
import { createSessionToken } from './_auth.js';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!adminPassword || !sessionSecret) {
    res.status(500).json({ error: 'Server nicht konfiguriert (ADMIN_PASSWORD/SESSION_SECRET fehlen).' });
    return;
  }

  const { password } = (req.body ?? {}) as { password?: string };
  if (typeof password !== 'string' || !safeEqual(password, adminPassword)) {
    res.status(401).json({ error: 'Falsches Passwort.' });
    return;
  }

  const token = createSessionToken(sessionSecret);
  res.status(200).json({ token });
}
