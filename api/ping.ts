import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';

/** Einfacher geschuetzter Test-Endpunkt - bestaetigt, dass das Session-Token gueltig ist. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  res.status(200).json({ ok: true });
}
