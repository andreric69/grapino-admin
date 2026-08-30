import type { VercelRequest, VercelResponse } from './_types.js';
import { createSessionToken, safeEqualStrings } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const supabase = getSupabaseAdmin();
  const { data: state } = await supabase
    .from('admin_login_state')
    .select('failed_count, locked_until')
    .eq('id', 1)
    .single();

  // Faellt die Zeile aus irgendeinem Grund weg, wird nicht blockiert (fail
  // open fuer die Bremse selbst) - die Passwort-Pruefung greift trotzdem.
  if (state?.locked_until && new Date(state.locked_until) > new Date()) {
    const waitMinutes = Math.ceil((new Date(state.locked_until).getTime() - Date.now()) / 60000);
    res.status(429).json({ error: `Zu viele Fehlversuche. Bitte in ${waitMinutes} Minute${waitMinutes === 1 ? '' : 'n'} erneut versuchen.` });
    return;
  }

  const { password } = (req.body ?? {}) as { password?: string };
  const ok = typeof password === 'string' && safeEqualStrings(password, adminPassword);

  if (!ok) {
    const nextCount = (state?.failed_count ?? 0) + 1;
    const lockedUntil = nextCount >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    await supabase
      .from('admin_login_state')
      .update({ failed_count: lockedUntil ? 0 : nextCount, locked_until: lockedUntil })
      .eq('id', 1);
    res.status(401).json({ error: 'Falsches Passwort.' });
    return;
  }

  if (state && (state.failed_count > 0 || state.locked_until)) {
    await supabase.from('admin_login_state').update({ failed_count: 0, locked_until: null }).eq('id', 1);
  }

  const token = createSessionToken(sessionSecret);
  res.status(200).json({ token });
}
