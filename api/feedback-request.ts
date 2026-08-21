import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('feedback_requests')
        .select('id, user_id')
        .is('fulfilled_at', null);
      if (error) throw error;
      res.status(200).json({ openUserIds: (data ?? []).map((r) => r.user_id) });
      return;
    }

    if (req.method === 'POST') {
      const { userId } = (req.body ?? {}) as { userId?: string };
      if (!userId) {
        res.status(400).json({ error: 'userId erforderlich.' });
        return;
      }
      // Keine Dopplungen: pro Nutzer nur eine offene Anfrage gleichzeitig.
      const { data: existing, error: existingError } = await supabase
        .from('feedback_requests')
        .select('id')
        .eq('user_id', userId)
        .is('fulfilled_at', null)
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        res.status(200).json({ ok: true, alreadyPending: true });
        return;
      }
      const { error } = await supabase.from('feedback_requests').insert({ user_id: userId });
      if (error) throw error;
      res.status(200).json({ ok: true, alreadyPending: false });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
