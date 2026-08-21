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
    if (req.method === 'POST') {
      const { userId, note } = (req.body ?? {}) as { userId?: string; note?: string };
      if (!userId || !note?.trim()) {
        res.status(400).json({ error: 'userId und note erforderlich.' });
        return;
      }
      const { error } = await supabase.from('admin_user_notes').insert({ user_id: userId, note: note.trim() });
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const { id } = (req.body ?? {}) as { id?: string };
      if (!id) {
        res.status(400).json({ error: 'id erforderlich.' });
        return;
      }
      const { error } = await supabase.from('admin_user_notes').delete().eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
