import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';
import { pingSupabase } from './_health.js';

const RECENT_ERRORS_LIMIT = 50;
const WEINAPP_URL = 'https://weinsammlung-two.vercel.app';
const FETCH_TIMEOUT_MS = 5000;

async function pingWeinapp(): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch(WEINAPP_URL, { method: 'HEAD', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return { ok: res.ok, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    const [supabaseStatus, weinappStatus, errorsResult] = await Promise.all([
      pingSupabase(supabase),
      pingWeinapp(),
      supabase
        .from('admin_error_log')
        .select('id, created_at, endpoint, message, detail')
        .order('created_at', { ascending: false })
        .limit(RECENT_ERRORS_LIMIT),
    ]);
    if (errorsResult.error) throw errorsResult.error;

    res.status(200).json({
      supabase: supabaseStatus,
      weinapp: weinappStatus,
      pushConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      recentErrors: errorsResult.data ?? [],
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
